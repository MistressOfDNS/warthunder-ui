# War Thunder Flight Desk

Local dashboard for War Thunder's telemetry endpoints exposed on `http://localhost:8111/`.

## Run

```bash
npm start
```

Then open `http://localhost:3000`.

## What it does

- Proxies War Thunder telemetry through a local Node server
- Polls fast and slow telemetry endpoints separately
- Renders a live tactical map using `map.img` and `map_obj.json`
- Shows aircraft metrics, engine data, control positions, mission status, and raw inspector tables

<img width="1915" height="967" alt="Screenshot from 2026-03-22 01-04-29" src="https://dc-images.gotdns.ch/i/f9642e6a452db5bb1afb7b6d5e3de154ecfaa60fdef31d78.png" />
