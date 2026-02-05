#!/usr/bin/env python3
"""
Dataset Status Checker for OpenDataSoft (ODS) Portals.

Designed to be called via @Claude in Slack. Parses an alert ticket message,
extracts the portal URL and dataset ID, then uses the ODS API to check
the current status and return a human-readable summary.

Usage:
    python check_dataset.py \
        --url "https://www.geelongdataexchange.com.au/backoffice/catalog/datasets/weather-together-temperature-and-humidity/" \
        --apikey "1fea40b499c067dabe839680df748d0f71c1d231fef1a52e46bf01d7"

    # Or parse from a full alert message:
    python check_dataset.py \
        --message "Alert on dataset Weather Together - Temperature and Humidity / Cannot fetch the resource" \
        --url "https://www.geelongdataexchange.com.au/backoffice/catalog/datasets/weather-together-temperature-and-humidity/" \
        --apikey "YOUR_API_KEY"
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests


def extract_dataset_info(url: str) -> dict:
    """Extract portal base URL and dataset ID from a backoffice dataset URL."""
    parsed = urlparse(url.rstrip("/"))
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    # Pattern: /backoffice/catalog/datasets/<dataset-id>/
    match = re.search(r"/backoffice/catalog/datasets/([^/]+)", parsed.path)
    if not match:
        # Fallback: try last path segment
        segments = [s for s in parsed.path.split("/") if s]
        dataset_id = segments[-1] if segments else None
    else:
        dataset_id = match.group(1)

    return {
        "base_url": base_url,
        "dataset_id": dataset_id,
        "original_url": url,
    }


def check_dataset_status(base_url: str, dataset_id: str, apikey: str) -> dict:
    """Check the dataset status using ODS Explore API v2.1."""
    results = {
        "dataset_id": dataset_id,
        "base_url": base_url,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "status": "unknown",
        "errors": [],
    }

    # --- 1. Get dataset metadata ---
    metadata_url = f"{base_url}/api/explore/v2.1/catalog/datasets/{dataset_id}"
    try:
        resp = requests.get(
            metadata_url,
            params={"apikey": apikey},
            timeout=30,
        )
        resp.raise_for_status()
        meta = resp.json()

        dataset_info = meta.get("dataset", meta)
        metas = dataset_info.get("metas", {})
        default_metas = metas.get("default", {})

        results["name"] = default_metas.get("title", dataset_id)
        results["description"] = default_metas.get("description", "")
        results["modified"] = default_metas.get("modified")
        results["data_processed"] = default_metas.get("data_processed")
        results["records_count"] = default_metas.get("records_count")
        results["metadata_fetched"] = True

        # Check features/status from metadata
        features = dataset_info.get("features", [])
        results["features"] = features

        # Attachments info
        attachments = dataset_info.get("attachments", [])
        results["attachments_count"] = len(attachments)

    except requests.exceptions.HTTPError as e:
        results["errors"].append(f"Metadata API error: HTTP {e.response.status_code}")
        results["metadata_fetched"] = False
    except requests.exceptions.RequestException as e:
        results["errors"].append(f"Metadata API error: {str(e)}")
        results["metadata_fetched"] = False

    # --- 2. Try to fetch records to see if data is accessible ---
    records_url = f"{base_url}/api/explore/v2.1/catalog/datasets/{dataset_id}/records"
    try:
        resp = requests.get(
            records_url,
            params={"apikey": apikey, "limit": 1},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        results["total_count"] = data.get("total_count", 0)
        results["records_accessible"] = True

        # If we got records, the dataset is working
        if results["total_count"] and results["total_count"] > 0:
            results["status"] = "ok"
        else:
            results["status"] = "warning"
            results["errors"].append("Dataset has 0 records")

    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code
        results["records_accessible"] = False
        if status_code == 404:
            results["status"] = "error"
            results["errors"].append("Dataset not found")
        elif status_code == 403:
            results["status"] = "error"
            results["errors"].append("Access denied - check API key permissions")
        else:
            results["status"] = "error"
            results["errors"].append(f"Records API error: HTTP {status_code}")
    except requests.exceptions.Timeout:
        results["records_accessible"] = False
        results["status"] = "error"
        results["errors"].append("Connection timed out - cannot fetch the resource")
    except requests.exceptions.ConnectionError:
        results["records_accessible"] = False
        results["status"] = "error"
        results["errors"].append("Connection error - cannot reach the portal")
    except requests.exceptions.RequestException as e:
        results["records_accessible"] = False
        results["status"] = "error"
        results["errors"].append(f"Records fetch error: {str(e)}")

    # --- 3. Check dataset status via automation/management API if available ---
    status_url = f"{base_url}/api/automation/v1.0/datasets/{dataset_id}"
    try:
        resp = requests.get(
            status_url,
            params={"apikey": apikey},
            timeout=15,
        )
        if resp.status_code == 200:
            auto_data = resp.json()
            results["publishing_status"] = auto_data.get("publishing", {}).get("status")
            results["has_alerts"] = auto_data.get("has_alerts", False)

            # Check resource statuses if available
            resources = auto_data.get("resources", [])
            resource_statuses = []
            for resource in resources:
                r_status = {
                    "type": resource.get("type"),
                    "url": resource.get("url"),
                    "status": resource.get("status"),
                }
                resource_statuses.append(r_status)
                if resource.get("status") in ("error", "failed"):
                    results["status"] = "error"
                    results["errors"].append(
                        f"Resource '{resource.get('type', 'unknown')}' is in error state"
                    )
            results["resources"] = resource_statuses
    except requests.exceptions.RequestException:
        # Automation API might not be available, that's fine
        pass

    # If no errors were found and status is still unknown, mark as ok
    if results["status"] == "unknown" and not results["errors"]:
        if results.get("metadata_fetched"):
            results["status"] = "ok"

    return results


def format_summary(results: dict, alert_message: str = None) -> str:
    """Format the check results as a human-readable summary."""
    lines = []
    status_emoji = {
        "ok": "✅",
        "error": "❌",
        "warning": "⚠️",
        "unknown": "❓",
    }

    emoji = status_emoji.get(results["status"], "❓")
    name = results.get("name", results["dataset_id"])

    lines.append(f"{emoji} **Dataset Status Check: {name}**")
    lines.append("")

    if alert_message:
        lines.append(f"**Alert:** {alert_message}")
        lines.append("")

    # Status
    status_upper = results["status"].upper()
    if results["status"] == "ok":
        lines.append(f"**Status:** {status_upper} — The dataset is accessible and working normally.")
    elif results["status"] == "error":
        lines.append(f"**Status:** {status_upper} — There are issues with this dataset.")
    elif results["status"] == "warning":
        lines.append(f"**Status:** {status_upper} — Dataset accessible but may have issues.")
    else:
        lines.append(f"**Status:** {status_upper}")

    lines.append("")

    # Key metrics
    lines.append("**Details:**")
    if results.get("total_count") is not None:
        lines.append(f"- Records available: {results['total_count']}")
    if results.get("records_count") is not None:
        lines.append(f"- Expected record count: {results['records_count']}")
    if results.get("modified"):
        lines.append(f"- Last modified: {results['modified']}")
    if results.get("data_processed"):
        lines.append(f"- Data processed: {results['data_processed']}")
    if results.get("publishing_status"):
        lines.append(f"- Publishing status: {results['publishing_status']}")
    if results.get("records_accessible") is not None:
        accessible = "Yes" if results["records_accessible"] else "No"
        lines.append(f"- Records accessible: {accessible}")

    # Resource statuses
    if results.get("resources"):
        lines.append("")
        lines.append("**Resources:**")
        for r in results["resources"]:
            r_status = r.get("status", "unknown")
            r_type = r.get("type", "unknown")
            lines.append(f"- {r_type}: {r_status}")

    # Errors
    if results.get("errors"):
        lines.append("")
        lines.append("**Issues Found:**")
        for err in results["errors"]:
            lines.append(f"- {err}")

    # Resolution note
    lines.append("")
    if results["status"] == "ok":
        lines.append(
            "🟢 **The issue appears to have resolved itself.** "
            "The dataset is currently responding normally and records are accessible."
        )
    elif results["status"] == "error":
        lines.append(
            "🔴 **The issue is still active.** "
            "The dataset is experiencing errors. This may be a transient issue — "
            "consider rechecking in a few minutes."
        )

    lines.append("")
    lines.append(f"**Dashboard:** {results['base_url']}/backoffice/catalog/datasets/{results['dataset_id']}/")
    lines.append(f"**Checked at:** {results['checked_at']}")

    return "\n".join(lines)


def parse_alert_message(message: str) -> dict:
    """Parse an alert ticket message to extract key details."""
    result = {
        "portal_name": None,
        "dataset_name": None,
        "error_type": None,
        "raw_message": message,
    }

    # Pattern: "Portal Name - Alert on dataset DatasetName / Error Message"
    match = re.match(
        r"^(.+?)\s*-\s*Alert on dataset\s+(.+?)\s*/\s*(.+)$",
        message.strip(),
    )
    if match:
        result["portal_name"] = match.group(1).strip()
        result["dataset_name"] = match.group(2).strip()
        result["error_type"] = match.group(3).strip()

    return result


def main():
    parser = argparse.ArgumentParser(description="Check ODS dataset status")
    parser.add_argument("--url", required=True, help="Dataset backoffice URL")
    parser.add_argument("--apikey", required=True, help="ODS API key")
    parser.add_argument("--message", default=None, help="Alert ticket message")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    # Extract dataset info from URL
    info = extract_dataset_info(args.url)
    if not info["dataset_id"]:
        print("Error: Could not extract dataset ID from URL", file=sys.stderr)
        sys.exit(1)

    # Parse alert message if provided
    alert_info = parse_alert_message(args.message) if args.message else None

    # Check status
    results = check_dataset_status(info["base_url"], info["dataset_id"], args.apikey)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        summary = format_summary(
            results,
            alert_message=args.message,
        )
        print(summary)


if __name__ == "__main__":
    main()
