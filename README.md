# Peclet Support Monitoring

Automation tool to check the status of OpenDataSoft (ODS) portal datasets when alert tickets are received. Designed to be triggered via **@Claude in Slack**.

## How It Works

1. A user posts a dataset alert in Slack (e.g., "Cannot fetch the resource")
2. User provides the dataset URL and API key
3. @Claude runs the check script against the portal's API
4. @Claude replies with a status summary — whether the issue is still active or has resolved itself

## Usage via @Claude in Slack

Provide the alert details to @Claude:

```
@Claude check this dataset alert:

Geelong Data Exchange - Alert on dataset Weather Together - Temperature and Humidity / Cannot fetch the resource because the connection has timed out
Dataset URL: https://www.geelongdataexchange.com.au/backoffice/catalog/datasets/weather-together-temperature-and-humidity/
API key: <your-api-key>
```

## Manual Usage

```bash
# Check a specific dataset
python3 scripts/check_dataset.py \
    --url "https://www.geelongdataexchange.com.au/backoffice/catalog/datasets/weather-together-temperature-and-humidity/" \
    --apikey "YOUR_API_KEY"

# With the alert message for context
python3 scripts/check_dataset.py \
    --url "https://www.geelongdataexchange.com.au/backoffice/catalog/datasets/weather-together-temperature-and-humidity/" \
    --apikey "YOUR_API_KEY" \
    --message "Geelong Data Exchange - Alert on dataset Weather Together / Cannot fetch the resource"

# JSON output
python3 scripts/check_dataset.py \
    --url "https://portal.example.com/backoffice/catalog/datasets/my-dataset/" \
    --apikey "YOUR_API_KEY" \
    --json
```

## What It Checks

1. **Dataset metadata** — title, last modified, record count via the Explore API v2.1
2. **Record accessibility** — whether records can actually be fetched
3. **Automation/management status** — publishing status, resource health, alerts

## Output

The script returns a summary including:
- Current status (OK / Error / Warning / Unknown)
- Record count and accessibility
- Whether the error has resolved itself
- Active issues if still present
- Link to the dashboard

## Supported Portals

Works with any OpenDataSoft-powered portal, including:
- Geelong Data Exchange (`www.geelongdataexchange.com.au`)
- ResolveXO (`dashboard.resolvexo.com`)
- Any other ODS portal

The portal URL and API key are dynamic — pass them per request.

## Requirements

- Python 3.8+
- `requests` library (`pip install requests`)
