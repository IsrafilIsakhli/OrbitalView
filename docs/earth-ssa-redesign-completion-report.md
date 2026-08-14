# Orbital Vision — Earth / SSA visual redesign completion report

Tarix: 2026-08-09  
Status: implementasiya və native real-data QA tamamlanıb

## Nəticə

Earth/SSA səhnəsi mövcud Cesium, CelesTrak, Launch Library 2, NASA, Open-Meteo və Tauri sərhədlərinin daxilində yenilənib. Paralel globe, ikinci satellite kataloqu, synthetic cluster, fake orbit və ya vizual məqsədli coordinate düzəlişi əlavə edilməyib.

Native yoxlama zamanı canlı kataloq **16,316 real CelesTrak obyektini** və **34 real LL2 launch site-ını** göstərib. High profildə bütün 16,316 obyekt Worker-də 1 Hz SGP4 ilə propagate edilir və mövcud Earth-fixed koordinatlarda render olunur.

## Fazalar üzrə tamamlanan iş

### 1. Earth və camera composition

- Earth preset hər keçiddə Cesium camera transformunu `Matrix4.IDENTITY` vəziyyətinə qaytarır.
- Overview məsafəsi sabit height deyil, canvas hündürlüyü, FOV və target Earth occupancy əsasında hesablanır.
- Earth 1080×680-dən 4K-a qədər bütün QA ölçülərində səhnənin əsas visual anchor-ıdır.
- Başlanğıc istiqaməti real Sun mövqeyindən hesablanır və terminatoru diskdə saxlayan 61° offset tətbiq edir.
- Satellite və launch focus sağ inspector üçün təhlükəsiz boş sahəni nəzərə alır.
- Earth, LEO, ISS, Moon və Sun preset keçidləri əvvəlki `lookAtTransform` state-indən azaddır.

Əsas fayllar: `CesiumCameraController.ts`, `cameraPresets.ts`, `CesiumEarthEngine.ts`, `EarthViewport.tsx`.

### 2. Orbit geometry və occlusion

- Worker orbital sample-ləri əvvəlcə real SGP4 ECI koordinatlarında yaradır.
- Space orbit bütün sample-ləri eyni reference timestamp GMST frame-i ilə ECF-ə çevirir; nəticə stabil orbital plane-dir.
- Ground track hər sample-in öz timestamp GMST-si ilə ECF-ə çevrilir və ayrıca surface geometry kimi render olunur.
- Orbit, marker, hover, selection və launch qatlarında through-Earth depth bypass ləğv edilib.
- Ground track `GroundPolylinePrimitive` ilə surface-aware qat kimi ayrılıb.
- Context orbit sayı eco/balanced/high üçün 1/2/3 real representative orbitlə məhdudlaşdırılıb.

Əsas fayllar: `orbit.worker.ts`, `orbitCoordinateFrames.ts`, `messages.ts`, `CesiumSatelliteLayer.ts`.

### 3. Satellite visual LOD

Render hierarchy üç pass-a ayrılıb:

1. Bütün quality-budget real obyektləri üçün kiçik catalog signals.
2. Eco/balanced/high üçün maksimum 90/160/240 real semantic marker.
3. Budget və category sampling-dən asılı olmayan hover/selection interaction pass.

Normal marker halo və outline-ları silinib. Distance translucency və scaling Cesium primitive səviyyəsində konfiqurasiya olunur. Camera tier-lərində hysteresis var; `applyFrame()` yalnız mövqe və propagation validity yeniləyir, vizual state-i yenidən yazmır.

Əsas fayllar: `CesiumSatelliteLayer.ts`, `satelliteVisualLod.ts`, `qualityProfiles.ts`.

### 4. Category visualization

- Category row click `focus`, ayrıca eye düyməsi visibility əməliyyatıdır.
- Focus edilmiş kateqoriya güclü signal/semantic hierarchy alır, digər aktiv kateqoriyalar zəif context kimi qalır.
- Representative obyekt və orbitlər real altitude, inclination və RAAN bucket-ləri üzrə deterministic seçilir.
- Starlink böyük marker kütləsi əvəzinə bounded signal field-dir.
- Navigation real orbital plane müxtəlifliyi göstərir.
- Debris focus avtomatik full orbit yaratmır.
- Panel full catalog, hazırkı signal və semantic marker saylarını ayrı göstərir.

Əsas fayllar: `EarthLayerPanel.tsx`, `EarthViewport.tsx`, `CesiumSatelliteLayer.ts`, `satelliteVisualLod.ts`, locale faylları və `global.css`.

### 5. Selection, hover və follow

- Prioritet selected → hovered → semantic → normal → distant sırası ilə sərtləşdirilib.
- Selected və hovered primitive-lər hər saniyə silinib yenidən yaradılmır; mövcud GPU primitive-ləri reuse olunur.
- Selected obyekt 12–16 px core, 24–30 px ring, label, full orbit, ground track, trail və direction cue alır.
- Hover qısa real SGP4 orbit arc-ı göstərir və selection yaratmır.
- Follow yalnız seçilmiş obyekt üçün O(1) per-frame exponential smoothing istifadə edir; 1 Hz data addımı görünən kamera sıçrayışına çevrilmir.
- Escape satellite/launch selection, follow, inspector və müvəqqəti orbit qatlarını təmizləyir.

Əsas fayllar: `CesiumSatelliteLayer.ts`, `SatelliteInfoPanel.tsx`, `EarthObjectTooltip.tsx`, `CesiumCameraController.ts`.

### 6. Launch sites

- Launch marker real LL2 longitude/latitude mövqeyində, WGS84/terrain səthinə clamp olunur.
- Əvvəlki 42 km world-space lift silinib; vizual separation yalnız screen-space offset ilə edilir.
- Marker amber diamond/launch-pad billboard-dur və satellite markerindən dərhal fərqlənir.
- Arxa hemisfer markerləri normal Earth depth test ilə gizlənir.
- Selected pad səthə bağlı ring, status/countdown və real mission inspector alır.
- Focus sağ inspector safe area-sını qoruyur; label kolleksiyası camera dəyişəndə rebuild edilmir.

Əsas fayllar: `CesiumLaunchLayer.ts`, `LaunchGlobePanel.tsx`, `CesiumCameraController.ts`, `global.css`.

### 7. Earth realism

- Sun intensity, HDR gamma, imagery contrast/saturation və atmosphere scattering vahid, təbii exposure üçün yenidən kalibrasiya edilib.
- NASA Black Marble yalnız gecə tərəfində qalır; işıqlar daha kontrollu alpha/gamma ilə göstərilir.
- Balanced/high profildə NASA GEOS-5 cloud texture nazik WGS84-aligned shell üzərindədir; eco və uyğun olmayan WebGL hallarında imagery fallback işləyir.
- Cloud shell geospatial footprint-i dəyişmir və ölçülə bilən cloud altitude kimi təqdim edilmir.
- Water effect yalnız seçilmiş terrain provider real water mask verirsə aktiv effekt sayılır.
- Layer sırası deterministikdir: base imagery → night lights → clouds.

Əsas fayllar: `configureScene.ts`, `SurfaceProviderCoordinator.ts`, `ScientificCloudLayer.ts`, `CesiumEarthEngine.ts`.

### 8. Performance

- GPU/resource quality ilə camera semantic LOD ayrılıb.
- Full propagation Worker-də 1 Hz qalır; main-thread smoothing yalnız selected object üçün O(1)-dir.
- Point, label, billboard və polyline kolleksiyaları reuse olunur.
- Category focus/toggle Worker restart və full catalog rebuild etmir.
- Repeated `Cartesian3`, `Color` və `NearFarScalar` allocation-ları hot path-dən çıxarılıb.
- Snapshot primitive, signal və semantic marker telemetry-si verir.

Native 30 saniyəlik high-profile ölçmə:

| Metrika | Nəticə |
| --- | ---: |
| Real CelesTrak kataloqu | 16,316 |
| Valid propagated obyekt | 16,316 |
| Rendered catalog signal | 16,316 |
| Semantic marker | 240 |
| Context orbit | 3 |
| Launch site | 34 |
| Median FPS | 60 |
| P05 FPS | 59.9 |
| P95 frame time | 16.67 ms |
| Primitive sayı | 16,577 |
| Native console error/warning | 0 / 0 |

Stress nəticələri:

- 50 category toggle-dan sonra primitive delta: **0**.
- 20 select/close dövründən sonra primitive delta: **0**.
- Starlink focus: 240 semantic marker, 3 representative orbit.
- Debris focus: 2 real semantic marker, 0 context orbit.
- Follow altı saniyə ərzində aktiv və hamar qalıb; Escape-dən sonra primitive sayı baseline-a qayıdıb.

### 9. QA və build gates

| Gate | Nəticə |
| --- | --- |
| TypeScript typecheck | Keçib |
| ESLint | Keçib, 0 warning |
| Frontend unit tests | Keçib: 14 fayl / 34 test |
| Real SGP4 center-position testi | Keçib, < 2 km acceptance limit |
| Rustfmt check | Keçib |
| Clippy `-D warnings` | Keçib |
| Rust tests | Keçib: 18 test |
| Production frontend build | Keçib |
| Tauri release build | Keçib |
| Native real-data runtime | Keçib: 16,316 obyekt / 34 site |
| Runtime console | Keçib: 0 error / 0 warning |
| Responsive visual QA | Keçib: 1080×680, 1440×900, 1920×1080, 2560×1440, 3840×2160 |

Native ssenarilər: overview, Starlink focus, debris focus, ISS selection, ISS follow, Escape reset və launch-site focus. Browser layout ssenariləri bütün beş target ölçüdə document overflow olmadan keçib.

## Data və təhlükəsizlik zəmanətləri

- CelesTrak OMM/SATCAT yeganə satellite truth source olaraq qalır.
- Launch Library 2 launch/site/mission/rocket məlumatının yeganə source-udur.
- NASA və Open-Meteo mövcud Tauri/cache sərhədindən istifadə edir.
- Provider API, Tauri command, cache formatı və backend response müqaviləsi dəyişdirilməyib.
- Heç bir fake satellite, orbit, coordinate, launch site və synthetic cluster yaradılmayıb.
- Hər semantic marker və representative orbit real catalog index-inə bağlıdır.
- Full catalog count ilə vizual signal/semantic count UI-da ayrı göstərilir.
- NASA API açarı yalnız environment-də qalır və source, build log, report və screenshot-a daxil edilməyib.

## Release artefaktları

- `src-tauri/target/release/orbital-vision.exe`
- `src-tauri/target/release/bundle/nsis/Orbital Vision_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Orbital Vision_0.1.0_x64_en-US.msi`

## Vizual sübutlar

- `docs/screenshots/earth-ssa-native-overview-final.png`
- `docs/screenshots/earth-ssa-native-starlink-focus.png`
- `docs/screenshots/earth-ssa-native-debris-focus.png`
- `docs/screenshots/earth-ssa-native-iss-selected.png`
- `docs/screenshots/earth-ssa-native-iss-follow.png`
- `docs/screenshots/earth-ssa-native-launch-selected.png`
- `docs/screenshots/earth-ssa-browser-1080x680.png`
- `docs/screenshots/earth-ssa-browser-1440x900.png`
- `docs/screenshots/earth-ssa-browser-1920x1080.png`
- `docs/screenshots/earth-ssa-browser-2560x1440.png`
- `docs/screenshots/earth-ssa-browser-3840x2160.png`
