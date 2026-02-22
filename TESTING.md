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
- The `slot` tag has two values: X (column) and Y (row)
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
   - The background should load from the renderpack
   - Plants should appear on the grid
   - Use the Eye icon (👁️) in the top right to toggle debug mode

## Debug Mode Features

When debug mode is enabled (Eye icon):
- **Yellow border**: Shows the plant area rectangle
- **Red grid**: Shows individual cell boundaries
- **Cell coordinates**: Displayed in each cell (col,row)
- **Plant hover info**: Hover over a plant to see crop, stage, slot, and ID

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

## Expected Renderpack Structure

The default test renderpack should have this structure:
```
https://raw.githubusercontent.com/Danidfra/farm-nostr-game/master/renderpacks/cozy-pixel-v1/
├── manifest.json
├── meta/
│   ├── maps/
│   │   └── farm.v1.json
│   └── crops.json (optional)
└── assets/
    └── backgrounds/
        └── farm-background.png
```

## Next Steps

After the MVP is working:
1. Implement planting/harvesting actions
2. Add publishing functionality for new plants
3. Implement growth timers
4. Add animations and transitions
5. Support for multiple maps per world

## Notes

- This MVP is **read-only** - no publishing of new events from the UI
- Uses `relay.primal.net` by default (configurable in `/src/lib/nostr/config.ts`)
- All event kinds follow the specs in `/docs/` folder
- Grid computation is based on layout metadata from the renderpack
