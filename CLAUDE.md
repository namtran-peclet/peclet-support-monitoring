# Peclet Support Monitoring - Claude Instructions

## Purpose
This repo contains automation tools for checking the status of OpenDataSoft (ODS) portal datasets when alerts are received (e.g., "Cannot fetch the resource", "Connection timed out").

## How to Use (triggered via @Claude in Slack)

When a user sends a dataset alert ticket, follow these steps:

### 1. Parse the alert message
Extract:
- **Portal name** (e.g., "Geelong Data Exchange")
- **Dataset name** (e.g., "Weather Together - Temperature and Humidity")
- **Error** (e.g., "Cannot fetch the resource because the connection has timed out")
- **Dataset URL** (e.g., `https://www.geelongdataexchange.com.au/backoffice/catalog/datasets/weather-together-temperature-and-humidity/`)
- **API key** (provided by the user — this is dynamic per portal)

### 2. Run the status check
```bash
python3 scripts/check_dataset.py \
    --url "<DATASET_URL>" \
    --apikey "<API_KEY>" \
    --message "<ALERT_MESSAGE>"
```

### 3. Return the summary
The script outputs a formatted summary including:
- Current status (OK / Error / Warning)
- Record count and accessibility
- Whether the issue resolved itself
- Dashboard link

### Important Notes
- The API key and portal URL are **dynamic** — they change depending on which portal the alert is for.
- Sometimes errors are **transient** and resolve themselves. The script checks if the dataset is currently working, regardless of what the alert said.
- If the dataset is OK now, report that the issue appears to have resolved.
- If the dataset is still erroring, report the active issue and suggest rechecking later.

## API Patterns (OpenDataSoft portals)
- Metadata: `GET /api/explore/v2.1/catalog/datasets/{dataset_id}?apikey={key}`
- Records:  `GET /api/explore/v2.1/catalog/datasets/{dataset_id}/records?apikey={key}&limit=1`
- Status:   `GET /api/automation/v1.0/datasets/{dataset_id}?apikey={key}`
