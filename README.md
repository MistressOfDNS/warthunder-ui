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

<img width="1915" height="967" alt="Screenshot from 2026-03-22 01-04-29" src="https://github.com/user-attachments/assets/f7951daf-d45c-47f3-94f7-033e1346666c" />
<img width="1912" height="962" alt="Screenshot from 2026-03-22 01-02-43" src="https://github.com/user-attachments/assets/40af0e2d-1fca-4bf1-b464-cbd3d878d00b" />
