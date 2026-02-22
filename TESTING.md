# Testing the Nostr Worlds MVP

This document provides instructions for testing the MVP implementation of the Nostr Worlds farming game.

## Overview

The MVP implements a read-only viewer that:
1. Lists WorldState events for the logged-in user
2. Allows opening/selecting a world
3. Loads renderpack data via HTTP (manifest + layout)
4. Renders the map background and computed planting grid
5. Fetches and renders PlantState events on the grid
6. Uses `relay.primal.net` as the default relay

## Prerequisites

1. **Install `nak`** (Nostr Army Knife) for publishing test events:
   ```bash
   go install github.com/fiatjaf/nak@latest
   ```

2. **Generate or use an existing Nostr key**:
   ```bash
   # Generate a new key (save the nsec securely)
   nak key generate
   
   # Or use an existing nsec
   export NOSTR_KEY="nsec1..."
   ```

## Publishing Test Events

### 1. Publish a WorldState (Kind 31415)

```bash
# Set your private key
export NOSTR_KEY="nsec1..."

# Publish WorldState
nak event -k 31415 \
  --tag d world:farm01 \
  --tag v 1 \
  --tag type farm \
  --tag name "Cozy Farm 01" \
  --tag renderpack_url "https://raw.githubusercontent.com/Danidfra/farm-nostr-game/master/renderpacks/cozy-pixel-v1" \
  --tag entry_map "farm.v1" \
  --tag season spring \
  --tag t world:farm01 \
  --content "" \
  wss://relay.primal.net
```

**Note**: The discovery tag (`t`) with the world ID is recommended for efficient relay filtering.

### 2. Publish a MapState (Kind 31416)

```bash
# Publish MapState for the world
nak event -k 31416 \
  --tag d map:world:farm01:farm \
  --tag v 1 \
  --tag world world:farm01 \
  --tag layout farm.v1 \
  --tag renderpack_url "https://raw.githubusercontent.com/Danidfra/farm-nostr-game/master/renderpacks/cozy-pixel-v1" \
  --tag name "Main Farm" \
  --tag t world:farm01 \
  --content "" \
  wss://relay.primal.net
```

**Note**: The `t` tag should match the world ID for discovery.

### 3. Publish PlantState Events (Kind 31417)

```bash
# Plant a carrot at slot (3, 2)
nak event -k 31417 \
  --tag d plant:world:farm01:farm:3:2 \
  --tag v 1 \
  --tag world world:farm01 \
  --tag map map:world:farm01:farm \
  --tag slot 3 2 \
  --tag crop carrot \
  --tag stage 2 \
  --tag planted_at $(date +%s) \
  --tag t world:farm01 \
  --content "" \
  wss://relay.primal.net

# Plant a wheat at slot (5, 3)
nak event -k 31417 \
  --tag d plant:world:farm01:farm:5:3 \
  --tag v 1 \
  --tag world world:farm01 \
  --tag map map:world:farm01:farm \
  --tag slot 5 3 \
  --tag crop wheat \
  --tag stage 1 \
  --tag planted_at $(date +%s) \
  --tag t world:farm01 \
  --content "" \
  wss://relay.primal.net

# Plant a tomato at slot (7, 4)
nak event -k 31417 \
  --tag d plant:world:farm01:farm:7:4 \
  --tag v 1 \
  --tag world world:farm01 \
  --tag map map:world:farm01:farm \
  --tag slot 7 4 \
  --tag crop tomato \
  --tag stage 3 \
  --tag planted_at $(date +%s) \
  --tag t world:farm01 \
  --content "" \
  wss://relay.primal.net
```

**Note**: 
- The `slot` tag supports two formats:
  - **Format 1** (recommended): `--tag slot 3 2` → creates `["slot", "3", "2"]`
  - **Format 2** (alternative): `--tag slot 3:2` → creates `["slot", "3:2"]`
  - Both formats are parsed correctly (X = column, Y = row)
- The `stage` is a 0-based index (0 = seed, 1 = sprout, 2 = growing, 3 = ready, etc.)
- The discovery tag (`t`) should match the world ID

### Batch Publishing Script

You can create a shell script to publish all events at once:

```bash
#!/bin/bash
# publish-test-world.sh

export NOSTR_KEY="nsec1..."  # Replace with your key

# Publish WorldState
echo "Publishing WorldState..."
nak event -k 31415 \
  --tag d world:farm01 \
  --tag v 1 \
  --tag type farm \
  --tag name "Cozy Farm 01" \
  --tag renderpack_url "https://raw.githubusercontent.com/Danidfra/farm-nostr-game/master/renderpacks/cozy-pixel-v1" \
  --tag entry_map "farm.v1" \
  --tag season spring \
  --tag t world:farm01 \
  --content "" \
  wss://relay.primal.net

# Wait a moment
sleep 1

# Publish MapState
echo "Publishing MapState..."
nak event -k 31416 \
  --tag d map:world:farm01:farm \
  --tag v 1 \
  --tag world world:farm01 \
  --tag layout farm.v1 \
  --tag renderpack_url "https://raw.githubusercontent.com/Danidfra/farm-nostr-game/master/renderpacks/cozy-pixel-v1" \
  --tag name "Main Farm" \
  --tag t world:farm01 \
  --content "" \
  wss://relay.primal.net

# Wait a moment
sleep 1

# Publish some plants
echo "Publishing PlantStates..."
for slot in "3 2 carrot 2" "5 3 wheat 1" "7 4 tomato 3" "2 5 corn 0" "9 1 potato 2"; do
  read -r x y crop stage <<< "$slot"
  nak event -k 31417 \
    --tag d "plant:world:farm01:farm:$x:$y" \
    --tag v 1 \
    --tag world world:farm01 \
    --tag map map:world:farm01:farm \
    --tag slot "$x" "$y" \
    --tag crop "$crop" \
    --tag stage "$stage" \
    --tag planted_at $(date +%s) \
    --tag t world:farm01 \
    --content "" \
    wss://relay.primal.net
  sleep 0.5
done

echo "All events published!"
```

Make it executable and run:
```bash
chmod +x publish-test-world.sh
./publish-test-world.sh
```

## Running the App

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Open the app**: Navigate to `http://localhost:5173` in your browser

3. **Log in**: 
   - Click "Log in" when prompted
   - Use the same nsec/private key you used to publish events
   - Or use a browser extension like Alby, nos2x, or Nostr Connect

4. **Select a world**:
   - Click the menu icon (☰) in the top bar
   - Navigate to "Worlds"
   - Click on "Cozy Farm 01" (or your world name)

5. **View the world**:
   - The background should load from the renderpack and scale to fit the viewport
   - Plants should appear on the grid, correctly aligned with the background
   - No scrollbars should appear (the world fits the screen)
   - Use the Eye icon (👁️) in the top right to toggle debug mode
   - Works on desktop and mobile (portrait/landscape)

## Debug Mode Features

When debug mode is enabled (Eye icon):
- **Yellow border**: Shows the plant area rectangle (scaled and aligned with background)
- **Red grid**: Shows individual cell boundaries (scaled and aligned)
- **Cell coordinates**: Displayed in each cell (col,row)
- **Plant hover info**: Hover over a plant to see crop, stage, slot, and ID

**Note**: All overlays (grid, plants) are automatically scaled to match the responsive background image. The grid computation uses natural layout pixel coordinates, and scaling is applied at render time.

## Troubleshooting

### No worlds found
- Make sure you published a WorldState event (kind 31415)
- Check that you're logged in with the same pubkey that published the events
- Verify the event was published to `relay.primal.net`

### Map not found
- Ensure you published a MapState event (kind 31416)
- The `world` tag in MapState must match the `d` tag in WorldState
- The discovery tag `t` should match the world ID

### Renderpack failed to load
- Check that the `renderpack_url` is accessible via HTTP
- Verify the URL structure:
  - Manifest: `{renderpack_url}/manifest.json`
  - Layout: `{renderpack_url}/meta/maps/{layout}.json`
  - Background: `{renderpack_url}/{layout.background}`

### Plants not showing
- Ensure PlantState events are published with the correct world and map IDs
- Check that slot coordinates are within the grid bounds (0-based)
- Verify the discovery tag `t` matches the world ID
- **Check browser console** for debug logs:
  - Look for `[usePlantStates] Fetched: X, Parsed: Y, Matched: Z`
  - If `Fetched > 0` but `Parsed = 0`: Check slot tag format (must be `["slot", "3", "2"]` or `["slot", "3:2"]`)
  - If `Parsed > 0` but `Matched = 0`: Verify world and map IDs match exactly
- **Slot tag format**: The parser supports both formats:
  - `--tag slot 3 2` (recommended) → `["slot", "3", "2"]`
  - `--tag slot 3:2` (alternative) → `["slot", "3:2"]`

### Missing or invalid crops.json
- The app will **not crash** if crops.json is missing or invalid
- Plants will render as placeholder tiles (🌱 on green background)
- **Check browser console** for crops loading status:
  - Success: `[useRenderpack] Crops metadata loaded: N crops ["carrot", "wheat", ...]`
  - Missing/Invalid: `[useRenderpack] No crops metadata (using placeholder sprites)`
- **crops.json format**: Must use dictionary structure (not array):
  ```json
  {
    "crops": {
      "carrot": { "file": "assets/crops/carrot.png", "stages": 4, "harvestStage": 3 },
      "wheat": { "file": "assets/crops/wheat.png", "stages": 5, "harvestStage": 4 }
    }
  }
  ```
  - If crops.json exists but has invalid structure, it will be ignored (no crash)

## Expected Renderpack Structure

The default test renderpack should have this structure:
```
https://raw.githubusercontent.com/Danidfra/farm-nostr-game/master/renderpacks/cozy-pixel-v1/
├── manifest.json (required)
├── meta/
│   ├── maps/
│   │   └── farm.v1.json (required)
│   └── crops.json (optional - graceful fallback if missing)
└── assets/
    └── backgrounds/
        └── farm-background.png (required)
```

**Note**: The app is designed to work even if crops.json is missing. Plants will simply render as placeholder sprites instead of using actual crop spritesheets.

## Next Steps

After the MVP is working:
1. Implement planting/harvesting actions
2. Add publishing functionality for new plants
3. Implement growth timers
4. Add animations and transitions
5. Support for multiple maps per world

## Responsive Behavior

The world renderer is fully responsive and works on all screen sizes:

### Desktop
- Background scales to fit the viewport (below the top bar)
- No scrollbars - the entire world is visible
- Debug grid and plants scale proportionally with the background
- Pixel art remains crisp with `image-rendering: pixelated`

### Mobile
- **Portrait mode**: Background scales to fit width, centered vertically
- **Landscape mode**: Background scales to fit height, centered horizontally
- Touch-friendly debug toggle button
- All overlays remain aligned regardless of orientation

### Technical Details
The renderer uses:
- **Container**: `flex-1 overflow-hidden` (fills remaining viewport after header)
- **Background**: `object-fit: contain` with `object-position: center`
- **Overlay scaling**: Computed via `ResizeObserver` to match scaled background
- **Coordinate system**: Grid math uses natural layout pixels, scaling applied at render time

### Testing Responsive Behavior
1. Resize browser window - background and overlays scale smoothly
2. Test on mobile device or browser dev tools
3. Rotate device (portrait ↔ landscape) - layout adapts without scrollbars
4. Enable debug mode to verify grid alignment at different sizes

## Notes

- This MVP is **read-only** - no publishing of new events from the UI
- Uses `relay.primal.net` by default (configurable in `/src/lib/nostr/config.ts`)
- All event kinds follow the specs in `/docs/` folder
- Grid computation is based on layout metadata from the renderpack
