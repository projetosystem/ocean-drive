# Changelog

## 2026-11-28: music panel [R]

- The car radio (Q) is gone. [R] opens the music panel: link (.mp3 / YouTube) or file, 3D from the car's speakers, with separate volumes inside and outside the car. The link box moved out of F1; R no longer recovers the vehicle (Backspace still does).

## 2026-11-28: 3D music by link

- F1 music (link or file) now comes out of the car's speakers in 3D (PannerNode at the sound-system boxes, follows the car; YouTube follows the distance in volume only). The radio mute silences it.

## 2026-11-21: MTA maps

- Map materials: GTA's grey tints no longer halve the textures (dark slopes/trees), foliage is cut-out
  instead of blended, a floor of emissive light on shaded slopes.

- `public/models/mta-maps/<id>/*.glb` (+ `index.json`): 5 circuits / touge roads (Touge Akina, Nikko, Okaru, Tsukuba, Meihan Circuit) converted from
  the same MTA pack (textures at 512 px, 48 MB in all; same licence note as the vehicles).
- `src/world/mta-maps.js`: **P** opens a teleport list; a map loads on first use, the district
  is hidden and the walker walks on a height grid rasterised from the map's own triangles
  (spawn on a road, facing along it). P again, the first entry, or a number key goes back to
  Ocean Drive. On foot only for now: the cars still drive on the district's world.

## 2026-11-22: F1 panel and MTA skins

- MTA skins reconverted with every part (face, shirt, trousers, shoes...: the BinMesh index lists of the DFFs were not read, so each skin had one texture over the whole body); `world/mta-skins.js` merges the parts with one material each.

- F1 panel: button to despawn the spawned car; low graphics redraws the sun shadow every 1 s instead of every 0.2 s (no recompile hitch); the BMW i8 and the Saveiro Cross (in the files, never used) are now in the fleet and in the spawn list.
- Sound: the F1 panel can switch each kind of sound off (sea, palm wind, gulls, traffic cars, own vehicle, horns, steps, radio, bar music); each module now has its own bus in audio/index.js (setCategoryMuted).
- F1 panel: music by link (an .mp3 / direct audio link, or a YouTube video / playlist through YouTube's hidden embedded player); the 'Rádio' mute silences it.
- Sound system (B): works in every vehicle (cars, the bike, the quad), not only the convertible; one saved layout per car model.
- MTA skins: hands and forearms of arms hanging at the sides were left behind when the arms were raised (carried by the hips, they curled in like hooks when walking); the whole arm is raised now.
- MTA skins: a skin chosen before the game starts no longer comes out stretched (the fit used a stale world matrix of the person's parent); the projected ground shadow now follows the skin.
- MTA skins: the arms are matched to the skeleton (shoulder at the arm bone, length to the hand bone), so the elbow no longer folds into the belly and the hands are not stretched.
- F1 panel: spawn any MTA car in front of you, take the cars (traffic and parked) and the NPCs off the map, and a low-graphics switch (half render scale, no sun shadow) for weaker PCs. Choices are kept.
- Drivers in low cars (Supra...): the feet no longer go through the floor and show under the body (ankles held above the floor level by the leg IK).
- MTA skins: only the first mesh of each LOD carries the skin (the leftover copies drew skin over the head).
- MTA skins: the arms (angled down in the files) are swung up to the skeleton's T-pose before the weights are taken: no more stretched slabs where the hands move.

- MTA cars (traffic and the one you drive) are lifted by what their tipping body would sink into the road (nose dive, roll): no more bumper through the asphalt.

- F1 opens a panel: FPS readout, and the skin of the player and of the NPCs (original, one MTA skin, or a
  mix of all 20). `public/models/mta-skins/*.glb` are static meshes; `world/mta-skins.js` fits each one
  to a person's own skeleton at load (scaled to the body, vertices weighted to the nearest bone
  segments), so every existing animation moves it. Arms can stretch a little in wide poses.

## 2026-11-21: MTA vehicles

- Fixes: zero-length normals in the converted files repaired at load (black screen next to the Golf); the seat anchor mirrored to the steering-wheel side; a traffic car you take keeps its model; the traffic cars have drivers.

- The road traffic now draws the MTA bodies too (wagon / crossover / pickup use the nearest model, scaled to the kind's length); no brake lamps or drivers on them yet.

- `public/models/mta/*.glb`: converted from the MTA pack
  (github.com/projetosystem/mta) with `dff2glb` (DFF + TXD -> GLB, 4 separate wheel nodes,
  body-colour material `paint`). **Third-party GTA/MTA models: the original authors' terms
  apply; check them before publishing the game.**
- `src/world/mta-vehicles.js`: the parked fleet is drawn from them near the viewer (each body
  kind picks a model by paint) and the cars the player drives are made from the same files;
  the traffic keeps the generic bodies. Kinds without a model (wagon, crossover, pickup) and the
  bikes / ATV keep the generic ones: the armoured/odd MTA models, the Kawasaki and the quad were removed.

## 2026-11-20: Sound system

- `src/vehicles/sound-system.js`: speaker boxes (subwoofer, trio, paredão, horn) on the
  convertible's sprung body. **B** in the car opens an editor: add / remove / select boxes, move,
  turn, tilt and resize (W/H/D); saved in localStorage. Their total volume drives the radio's bass
  (`audio.radio.setBass`: opens the highpass, boosts 55 Hz and the low shelf) and the cones pump
  with the music. Boxes are procedural; optional models in `public/models/sound/{trio,paredao,corneta}.glb`
  replace them when present (not included: third-party originals).

## 2026-11-18: Mazda2

- A 2015 Mazda2 hatchback (`public/models/mazda2.glb`) is parked at the nearest free bay of the
  west curb to the convertible, loaded with the `GLTFLoader` (`src/world/mazda2.js`, started
  early from `preloadCars`). The file is fitted to the scene: scaled to the real car's 4.06 m,
  its origin the middle of the wheelbase with the tyres on the road, turned to face south like
  the rest of the curb (the model's nose is at -z), and given a collider and a contact shadow.
  Its materials are rebuilt per part (lacquer, chrome, rubber, alpha glass in place of the
  file's transmission glass) on the same reflection chunks as the fleet. It is scenery for now
  (it blocks the walker, but cannot be driven) and is left out of the `?shot` frames.
- **Provenance:** *2015 Mazda2* by ActsOfDoge on Sketchfab
  (https://sketchfab.com/3d-models/2015-mazda2-a288a11333a044689702cc5d3f910a5d), under the
  Sketchfab Standard license. Check that license before redistributing the file.

## 2026-10-01: fast travel

- The number keys 1–0 (touch: a pin button top right with the same list) jump to ten places
  through a quick fade to warm white: the beach waterline, your car, the hotel sidewalk, the
  promenade, the 11 ST crossing, a café, the convertible, the ATV, the lifeguard tower deck and
  the start. Each spot is resolved when used, clear of every collider and facing the sea or
  down the street. Driving, the road destinations take the car along and set it down at rest in
  a lane; the others get out first. A small art-deco caption names the place.
  (`src/player/fasttravel.js`, checked by `node tools/fasttravel-test.mjs`.)

## 2026-09-30: cars, people and the open world

The walk became a drive. The street's cars are now models built in Blender, the 1950s
convertible at the curb can be driven, the drive has traffic, the sidewalks, cafés and benches
have people, and the whole district is an open world: any parked car or stopped traffic car can
be taken, and the car can go over the park lawn, down the seawall ramps, onto the sand and into
the surf. There are no weapons, no fighting and no real brands; taking a traffic car is a
borrowing, and its driver gets out and waves.

### Cars, modelled in Blender

- A hero convertible (a two-tone 1950s car with fins, a chrome spear, wide whitewalls, a
  tuck-and-roll bench, a banded dash cluster with a working speedometer, pedals, wipers, vents
  and a rear-view mirror) and a fleet of seven modern bodies (sedan, SUV, hatch, coupe, pickup,
  wagon, crossover), all authored in Blender by Python scripts in `blender/` and exported as
  Meshopt-compressed GLBs (`public/models/`).
- Each modern body has a generic cockpit (steering pivot and grips, eye anchor, speedo binnacle
  and needle, headliner, pillars, door cards, pedals, mirror) and a collapsed far level of detail.
- The parked fleet is drawn as BatchedMesh LODs with chunked culling; lacquer paint, chrome and
  glass take a local reflection probe; contact shadows are computed textures.

### The drivable convertible

- A sim with a sprung body (squat, dive, roll), a synthesized V8 (starter, lope at idle, load),
  a horn, the driver's view and a chase camera, and touch controls.
- The player's body at the wheel: hands hand-over-hand on the rim with a curled grip, feet on
  the pedals, the head hidden from the driver's eye.

### Traffic

- An IDM traffic sim on the drive, 30 cars of all eight bodies and classic convertibles, stopping
  at the crosswalks for pedestrians, at the cycling 11 ST signal (three-lens heads on a
  Miami-Dade-style mast arm) and for the player, with positional engines, Doppler, brake lights
  with a crimson halo and contact shadows.
- It reacts to the player: predictive braking, a startle beep with the driver's honk gesture,
  swerving round a partial block and passing a car left standing in the lane.

### People and drivers (Mixamo)

- A crowd of walkers, joggers, skaters and people sitting at cafés and on benches, and a seated
  driver in every traffic car, all Mixamo characters with Mixamo animation clips (walks, jogs,
  idles, sitting, talking, phoning, driving, honking, waving), retargeted and optimized into
  `public/models/people/`.
- Grounded with foot contact patches and long low-sun shadows; they dodge vehicles, never
  sidestep into one, and turn their heads to a car coming their way.

### Open world, phase 1

- Enter any parked car at its door (E / F, either side), drive it anywhere, get out anywhere.
- Surfaces: the park lawn, seawall ramps down to the beach, soft sand you can sink and bog in
  (rock it free, or R to recover), wet sand and the shallow surf, where the engine drowns if the
  water reaches the intake.
- Curbs, collisions and impulses against the street furniture; soft world ends that turn you
  back; skid marks on a handbrake slide; a speedometer HUD in the loading card's Art Deco manner.

### Open world, phase 2

- Take a stopped traffic car at its driver's door: the driver gets out, waves and walks off.
- The last car you got out of is saved across reloads, dents included.
- A minimap (heading up or north up, the saved car marked), a car radio with three generative
  stations (Bossa at Dawn, Sunrise Synth, Clave Café), knockable bins, news boxes, barricades and
  cones, road-closed ends, light dents on the modern cars, parked classics in the curb rows,
  and water spray and a foam wake round the wheels in the surf.

### Polish (this release)

- Getting into a car: the camera is in the driver's head from the first frame, and the seated
  body stays hidden until the look has turned (no headless torso or long arms seen from outside).
- A traffic driver getting out: the door swings open and shuts behind them, they have a foot
  contact patch, and they walk off round the car's rear, out of the new driver's way.
- HUD: the riding key hints are small, bottom left, and fade 4 s after getting in; the radio card
  is a transparent caption between gold hairlines that fades after 3 s; the minimap has an
  outline and a drop shadow, a larger chevron, an N badge and lighter roads.
- Skid marks: soft, patchy grey-brown rubber (about 0.35 opacity) on the asphalt only, broken at
  a curb step or a change of surface; ruts in the sand and flattened grass from every tyre.
- Sand and surf: the car sits 8-12 cm into the sand and the water; spray is thin, long streaks
  that glow gold when backlit by the low sun; fine sand is thrown off the tyres on dry sand.
- Dents: each vertex is capped in how far it can be pushed in, with a smooth falloff and normals
  kept on the modelled side, so the grille and panels no longer tear or open black holes.
- World edge: Type III barricades with three striped rails, a sign plate and sandbags; the
  placeholder blocks past the cross streets' barricades fade into the haze.
- Perf on an RTX 4060 at 1920×1080, high tier (`tools/perf-primary.mjs`): GPU median 6.2 ms;
  CPU work p95 by phase: walking 7.9, ATV 5.0, cockpit 5.8, driving 3.7 ms.

### Asset provenance

- **Characters and animations:** Mixamo (Adobe), used under the Mixamo license (free for use in
  projects, including commercial; the raw assets are not redistributed as a standalone library).
  Characters: Bryce, Elizabeth, Lewis, Megan and Sophie; clips as listed above.
- **Normal maps:** Poly Haven, CC0: *Leather White* (the convertible's vinyl) and *Dirty Carpet*
  (the footwells), at 1K, converted to WebP (`public/textures/cars/`).
- **Cars:** modelled in Blender by this project (`blender/*.py`, `blender/cars.blend`).
- Everything else (the hotels, palms, street, beach, ocean, sky, signs and every sound) is still
  generated in code at load time. All hotel names are invented.
