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

![](https://dc-images.havedns.net/i/e5379b95c856135330a6b38e410516b2aed910c390b12771.png)
