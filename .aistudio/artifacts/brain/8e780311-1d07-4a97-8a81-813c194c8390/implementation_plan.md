# SIREADER Virtual Office — Final Implementation Plan (Fase 1)

Dokumen ini merupakan spesifikasi final Fase 1 **SIREADER Virtual Office** yang menyatukan baseline arsitektur awal dengan seluruh penyempurnaan teknis wajib (pemisahan entitas *Worker* & *Task*, *Simulation Engine* deterministik yang terpisah dari *Worker Mock Service*, manajemen state *Zustand*, kesiapan skalabilitas 7–100 *worker*, konfigurasi aset karakter GLB/placeholder artikulatif, serta penandaan metrik `SIMULATED`).

> [!IMPORTANT]
> **Batasan Mutlak Fase 1 (100% Frontend-Only & Zero Backend Modification)**
> - **Dilarang** mengubah backend Python SIREADER, database, migration, maupun `.env`.
> - **Dilarang** menghubungkan Telegram, MT5, API produksi, kredensial nyata, atau mengeksekusi trading.
> - Seluruh *worker*, *task*, antrean (*queue*), aktivitas, token, dan biaya menggunakan simulasi lokal deterministik di sisi frontend dan **wajib** diberi label eksplisit `SIMULATED`.

---

## 1. Pemahaman Final Terhadap Arsitektur

Arsitektur Fase 1 dirancang sebagai aplikasi simulasi manajemen kantor masa depan (*Futuristic Corporate Sci-Fi*) berbasis 3D isometrik yang **data-driven**, **modular**, dan **terisolasi penuh dari layer rendering**.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SIREADER VIRTUAL OFFICE (FASE 1)                     │
├──────────────────────────────────────┬───────────────────────────────────────┤
│         3D ISOMETRIC VIEWPORT        │        ACCESSIBLE HTML OVERLAY        │
│    (React Three Fiber v9 + Drei)     │       (Tailwind CSS + Semantic)       │
│                                      │                                       │
│  ┌────────────────────────────────┐  │  ┌─────────────────────────────────┐  │
│  │ OfficeScene (Ortho Camera Rig) │  │  │ TopBar                          │  │
│  │  ├─ Static: OfficeBuilding     │  │  │  ├─ Global Office Metrics       │  │
│  │  │   ├─ Corridors & Partitions │  │  │  │  (Wajib berlabel SIMULATED)  │  │
│  │  │   ├─ Instanced Furniture    │  │  │  ├─ Sim Controls (Play/Pause/   │  │
│  │  │   └─ 7 Department Rooms     │  │  │  │  Speed/Seed Reset)           │  │
│  │  └─ Dynamic: Workstations &    │  │  │  └─ Camera Reset & Quick Select │  │
│  │      WorkerAvatars [1..7]      │  │  ├─────────────────────────────────┤  │
│  │       ├─ GLB Loader + Suspense │  │  │ WorkerPanel + WorkerControls    │  │
│  │       └─ Articulated Humanoid  │  │  │  ├─ Worker Status vs Task Status│  │
│  │          Placeholder (Honest)  │  │  │  ├─ Active Task & Task Queue    │  │
│  └───────────────┬────────────────┘  │  │  ├─ Assign Mock Task / Pause    │  │
│                  │ (useFrame + Refs) │  │  └─ Token & Cost (SIMULATED)    │  │
│                  │ Tanpa 60Hz setState  ├─────────────────────────────────┤  │
│                  │                   │  │ ActivityFeed                    │  │
│                  ▼                   │  │  └─ Deterministic Event Stream  │  │
├──────────────────┴───────────────────┴──┴─────────────────┬──────────────────┤
│                    ZUSTAND CENTRAL STORE (worker.state.ts)                   │
│   ├─ Normalized Workers Map (Record<WorkerId, WorkerEntity>)                 │
│   ├─ Normalized Tasks Map (Record<TaskId, TaskEntity>) + Per-Worker Queue    │
│   ├─ Selected Worker / Room State & Camera Command Trigger                   │
│   └─ Activity Event Log & Global Simulation Clock State                      │
├──────────────────────────────────────┬───────────────────────────────────────┤
│   SIMULATION ENGINE (Deterministic)  │         WORKER MOCK SERVICE           │
│  ├─ Seeded PRNG (Reproducible Tests) │  ├─ Assign Task & Enqueue             │
│  ├─ Tick Loop & Time Progression     │  ├─ Complete Task & Queue Advancement │
│  ├─ State Machine Transitions        │  ├─ Simulated Token & Cost Calculator │
│  └─ Global/Worker Pause & Resume     │  └─ Activity Event Generator          │
└──────────────────────────────────────┴───────────────────────────────────────┘
```

### Prinsip Arsitektur Inti:
1. **Pemisahan Entitas `Worker` dan `Task`**:
   - **Worker Entity**: Menyimpan identitas statis & konfigurasi spasial (`id`, `name`, `role`, `department`, `roomId`, `workstationPosition`, `avatarConfig`) serta status operasional agen (`IDLE`, `BUSY`, `PAUSED`, `OFFLINE`), ID tugas aktif (`currentTaskId`), dan daftar antrean (`taskQueueIds: TaskId[]`).
   - **Task Entity**: Entitas mandiri (`id`, `workerId`, `title`, `category`, `priority`, `status`: `QUEUED` | `ROUTING` | `EXTRACTING` | `ANALYZING` | `VALIDATING` | `ARCHIVING` | `COMPLETED`, `progress`, `estimatedTokens`, `simulatedCostUsd`, `createdAt`, `completedAt`).
   - Dengan pemisahan ini, satu *worker* dapat berstatus `BUSY` dengan tugas aktif berstatus `ANALYZING` sementara memiliki beberapa tugas berikutnya yang berstatus `QUEUED`.
2. **Pemisahan `Simulation Engine` dari `Worker Mock Service`**:
   - **Simulation Engine**: Bertanggung jawab atas detak waktu simulasi (*simulation clock*), *Seeded Pseudo-Random Number Generator (PRNG)* agar skenario dapat direproduksi 100% saat unit testing, aturan *state machine* transisi status tugas dan pekerja, penanganan *pause/resume* (baik per-worker maupun global), serta pemicuan tugas terjadwal secara deterministik.
   - **Worker Mock Service**: Bertanggung jawab atas operasi domain pekerja: pembuatan & penugasan tugas (*assign task*), pengelolaan antrean (*enqueue / dequeue / promote next task*), penyelesaian tugas, perhitungan *token & cost* simulasi, serta pencatatan *Activity Event*.
3. **Skalabilitas Data-Driven (7 → 50–100 Worker)**:
   - Seluruh 7 pekerja awal (*Supervisor AI, Haiku Worker, Sonnet Worker, Opus Worker, Decision Engineer, Market Monitor, Data Archivist*) didefinisikan dalam *Normalized Registry* beserta konfigurasi ruangan dan meja kerja.
   - Elemen arsitektur berulang (kursi, meja standar, monitor, partisi) dirancang agar dapat menggunakan *instancing* / geometri terbagi, memisahkan grup *mesh* statis gedung dari grup *mesh* dinamis avatar, serta siap menerapkan *Level of Detail (LOD)* ketika jumlah agen bertambah.
4. **Sistem Aset Karakter & Kejujuran Visual**:
   - Setiap worker memiliki `avatarConfig`: `{ modelUrl: string | null, animationMap: { idle, seated, typing, walking, talking }, fallbackType: 'articulated-humanoid', accentColor: string }`.
   - Komponen `WorkerAvatar` mendukung pemuatan model GLB/glTF ber-rig dan klip animasi melalui `useGLTF` & `useAnimations`. Selama file GLB manusia final belum tersedia, sistem merender **Articulated Humanoid Placeholder** (memiliki kepala, visor, torso, bahu, lengan berengsel, dan tangan yang bergerak sesuai state `idle`, `seated`, `typing`, `walking`, `talking` di dalam `useFrame` melalui `ref`) dan menampilkan label eksplisit `PLACEHOLDER AVATAR — GLB READY` di UI.
5. **Disiplin Performa Rendering (`useFrame` vs React State)**:
   - Animasi kontinyu 60fps (gerakan mengetik lengan avatar, indikator cincin seleksi, pendaran layar monitor) dieksekusi murni melalui mutasi `THREE.Object3D` via `useRef` di dalam `useFrame`.
   - Store Zustand / React state **hanya** diperbarui ketika terjadi perubahan diskrit (transisi status, progres tahapan task, penugasan baru, seleksi worker, atau event log).

---

## 2. Struktur Folder yang Akan Digunakan

Mengikuti pedoman modular `01-software-architecture.md` dan mengadaptasinya secara bersih pada template proyek Vite + React + TypeScript:

```text
/
├── AI_RULES.md                      # Aturan inti proyek (disalin dari panduan)
├── docs/
│   ├── PROJECT_STATE.md             # Status aktual proyek & hasil verifikasi
│   └── skills/                      # Referensi skill yang relevan
├── src/
│   ├── app/
│   │   └── OfficeApp.tsx            # Shell utama penggabung 3D Scene & HTML Overlay
│   ├── workers/
│   │   ├── worker.types.ts          # Tipe ketat Worker, Task, Queue, Event, & Metrics
│   │   ├── worker.registry.ts       # Normalized registry 7 worker, 7 ruangan & koordinat
│   │   ├── worker.mock-service.ts   # Operasi domain: assign, queue, complete, token/cost
│   │   ├── simulation.engine.ts     # Deterministic PRNG, clock tick, & aturan transisi state
│   │   ├── simulation.engine.test.ts# Unit test deterministik untuk Simulation Engine & Queue
│   │   └── worker.state.ts          # Zustand store terpusat (workers, tasks, events, UI)
│   ├── scene/
│   │   ├── scene.constants.ts       # Dimensi gedung, palet warna 3D, batas kamera isometrik
│   │   ├── OfficeScene.tsx          # Canvas R3F, OrthographicCamera, Map/Orbit Controls, Lights
│   │   ├── OfficeBuilding.tsx       # Lantai dasar, koridor tengah, dinding luar & penanda
│   │   ├── Room.tsx                 # Komponen ruangan modular, partisi kaca, & label terbaca
│   │   ├── Workstation.tsx          # Meja, kursi, multi-monitor, & cincin seleksi interaktif
│   │   └── WorkerAvatar.tsx         # Loader GLB + Articulated Humanoid Placeholder (useFrame)
│   ├── ui/
│   │   ├── TopBar.tsx               # Ringkasan kantor, badge SIMULATED, kontrol kamera & sim
│   │   ├── WorkerPanel.tsx          # Profil detail worker, active task, & task queue list
│   │   ├── WorkerControls.tsx       # Tombol Assign Mock Task, Pause/Resume, & preset tugas
│   │   └── ActivityFeed.tsx         # Stream aktivitas real-time simulasi & filter departemen
│   ├── utils/
│   │   └── formatters.ts            # Formatter angka tabular, token, biaya ($), & waktu
│   ├── App.tsx                      # Entry component yang me-render OfficeApp
│   ├── index.css                    # Konfigurasi Tailwind CSS & utilitas tema gelap sci-fi
│   └── main.tsx                     # Root mounting React 19
```

---

## 3. Daftar Dependensi dan Alasan Pemilihannya

| Paket | Status Saat Ini | Peran & Alasan Pemilihan |
| :--- | :--- | :--- |
| `react` & `react-dom` (`^19.0.1`) | Sudah terpasang | Fondasi UI utama sesuai target arsitektur proyek. |
| `typescript` (`^7.0.2`) & `vite` (`^8.3.0`) | Sudah terpasang | Pengetikan statis ketat (*strict mode*) dan bundler cepat untuk pengembangan & build produksi. |
| `tailwindcss` (`^4.3.3`) & `lucide-react` (`^0.546.0`) | Sudah terpasang | Styling utilitas presisi untuk HUD/Overlay korporat *sci-fi* dan ikonografi fungsional yang bersih. |
| `three` & `@types/three` | **Akan dipasang** | Engine WebGL/3D inti beserta definisi tipe TypeScript untuk manipulasi objek, material PBR, dan matematika 3D. |
| `@react-three/fiber` (`^9.x` stabil) | **Akan dipasang** | Deklaratif React renderer untuk Three.js. Dipilih **v9 stabil** karena kompatibel resmi dengan React 19 (bukan v8 yang khusus React 18, dan bukan v10 alpha). |
| `@react-three/drei` (rilis stabil kompatibel R3F v9) | **Akan dipasang** | Menyediakan komponen bantu esensial yang teruji: `OrthographicCamera`, `MapControls`/`OrbitControls`, `Text`/`Html` untuk label ruangan, serta `useGLTF`/`useAnimations` untuk sistem aset karakter. |
| `zustand` (`^5.x` stabil) | **Akan dipasang** | State management ringan berbasis *selector* untuk menyimpan *normalized worker/task store*. Memungkinkan komponen 3D dan UI berlangganan hanya pada slice state yang dibutuhkan tanpa memicu re-render kanvas penuh. |

*(Tidak ada dependensi tambahan di luar daftar ini agar proyek tetap ramping dan bebas konflik).*

---

## 4. Rencana Implementasi Per Tahap

Sesuai aturan implementasi, pengerjaan akan dilakukan **satu tahap pada satu waktu** setelah rencana ini disetujui:

- **Tahap 1 — Project Foundation**:
  - Menyalin `AI_RULES.md` dan `docs/PROJECT_STATE.md` ke workspace, memasang paket `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`, dan `zustand`, memperbarui `metadata.json` & `index.html`, serta memastikan kerangka dasar aplikasi berjalan tanpa error.
- **Tahap 2 — Worker Data Layer, Simulation Engine, & Zustand Store**:
  - Mengimplementasikan `worker.types.ts`, `worker.registry.ts` (7 worker awal & tata letak 7 ruangan), `worker.mock-service.ts`, `simulation.engine.ts` (dengan *seeded PRNG* dan *state machine* transisi Worker vs Task), serta `worker.state.ts` menggunakan Zustand.
- **Tahap 3 — 3D Scene, Isometric Camera, & Lighting**:
  - Membangun `scene.constants.ts` dan `OfficeScene.tsx` dengan kamera ortografik isometrik default, kontrol *pan*, *zoom* (dengan batas min/max), fungsi *reset camera*, serta pencahayaan *Futuristic Corporate Sci-Fi* (graphite/navy base dengan aksen cyan, electric blue, dan violet).
- **Tahap 4 — Office Building, 7 Department Rooms, & Workstations**:
  - Membangun `OfficeBuilding.tsx`, `Room.tsx`, dan `Workstation.tsx` yang menampilkan lantai dasar, koridor tengah yang menghubungkan seluruh 7 departemen, dinding partisi kaca, papan nama ruangan yang tajam pada zoom normal, serta meja kerja interaktif yang dapat diklik.
- **Tahap 5 — Modular Worker Avatar & State-Driven Animation**:
  - Membangun `WorkerAvatar.tsx` yang membaca `avatarConfig` (`modelUrl`, `animationMap`, `fallbackType`, `accentColor`), menyiapkan pipeline GLB/glTF, serta merender *Articulated Humanoid Placeholder* yang merespons state (`idle`, `seated`, `typing`, `walking`, `talking`) secara mulus via `useFrame` dan `ref`.
- **Tahap 6 — Accessible HTML Overlay, Controls, & Activity Feed**:
  - Membangun `TopBar.tsx`, `WorkerPanel.tsx`, `WorkerControls.tsx`, dan `ActivityFeed.tsx` untuk menampilkan profil pekerja, pemisahan status Worker vs Task, daftar antrean (*task queue*), tombol *Assign Mock Task*, *Pause/Resume*, *live activity feed*, serta badge eksplisit `SIMULATED` pada seluruh metrik token/biaya.
- **Tahap 7 — Verification (Unit Test, Typecheck, Build, Browser Check, & State Doc)**:
  - Menjalankan unit test deterministik (`simulation.engine.test.ts`), pemeriksaan TypeScript (`tsc --noEmit`), build produksi (`npm run build`), verifikasi visual & klik di browser, lalu mencatat hasil aktual ke `docs/PROJECT_STATE.md`.

---

## 5. Risiko Teknis dan Strategi Pencegahannya

1. **Risiko 1: Konflik Peer Dependency antara React 19 dan Ekosistem R3F/Drei**
   - *Penyebab*: Versi lama `@react-three/fiber` (v8) mengunci peer dependency ke React 18.
   - *Strategi Pencegahan*: Memastikan pemasangan `@react-three/fiber` v9 stabil bersama versi `@react-three/drei` dan `three` yang kompatibel, serta memverifikasi kompilasi di Tahap 1 sebelum menulis kode scene.
2. **Risiko 2: Penurunan Frame Rate (Lag) Akibat Re-render React di Dalam Loop 3D**
   - *Penyebab*: Memanggil `setState` atau memperbarui store Zustand pada setiap frame (`useFrame` 60Hz) akan memicu re-render komponen React secara masif.
   - *Strategi Pencegahan*: Seluruh interpolasi posisi/rotasi sendi avatar, cincin seleksi, dan efek visual dijalankan murni melalui `useRef` di dalam `useFrame`. Store Zustand hanya dipanggil oleh *Simulation Engine* pada interval transisi diskrit (mis. setiap tick simulasi atau aksi klik pengguna), dan komponen 3D menggunakan *atomic selector* Zustand.
3. **Risiko 3: Event Bubbling Saat Mengklik Avatar/Workstation di Kanvas Isometrik**
   - *Penyebab*: Raycaster Three.js dapat menembus avatar, meja, dan lantai sekaligus sehingga memicu pemilihan yang salah atau membatalkan seleksi.
   - *Strategi Pencegahan*: Menggunakan `e.stopPropagation()` secara disiplin pada handler `onClick` dan `onPointerOver`/`onPointerOut` di `WorkerAvatar` dan `Workstation`, serta menyediakan tombol pemilih pekerja HTML aksesibel yang terhubung ke store yang sama.
4. **Risiko 4: Kegagalan Pemuatan Aset GLB atau Ketiadaan File Model Eksternal**
   - *Penyebab*: Jika `modelUrl` kosong atau gagal dimuat, Suspense R3F tanpa error boundary/fallback dapat menghentikan rendering scene.
   - *Strategi Pencegahan*: Memeriksa ketersediaan `modelUrl` secara eksplisit di `avatarConfig`; jika `null` (kondisi default Fase 1 sebelum aset GLB berlisensi ditambahkan), langsung merender *Articulated Humanoid Placeholder* tanpa melakukan request jaringan yang gagal (Zero-404), serta membungkus pemuat GLB dengan Error/Suspense fallback.
5. **Risiko 5: Kamera Isometrik Kehilangan Fokus Saat Pan/Zoom Ekstrem**
   - *Penyebab*: Pengguna menggeser (*pan*) atau melakukan *zoom out/in* terlalu jauh hingga kantor menghilang dari *frustum*.
   - *Strategi Pencegahan*: Membatasi `minZoom`, `maxZoom`, serta sudut polar/azimuth pada kontrol kamera, dan menyediakan tombol **Reset Isometric View** di `TopBar` yang mengembalikan posisi & target kamera secara mulus.

---

## 6. Kriteria Keberhasilan Setiap Tahap (Acceptance Criteria)

- **Kriteria Tahap 1 (Project Foundation)**:
  - Struktur folder dan dokumen `AI_RULES.md` serta `docs/PROJECT_STATE.md` terbentuk rapi.
  - Seluruh dependensi (`three`, `@react-three/fiber` v9, `@react-three/drei`, `zustand`) terpasang tanpa error kompilasi, dan dev server berjalan normal.
- **Kriteria Tahap 2 (Worker Data Layer & Simulation Engine)**:
  - 7 worker awal terdaftar lengkap di `worker.registry.ts` dengan koordinat ruangan/meja dan `avatarConfig`.
  - Entitas `Worker` dan `Task` terpisah dengan benar; satu worker dapat memiliki 1 task aktif dan beberapa task di `taskQueue`.
  - `Simulation Engine` dengan *seeded PRNG* dan `Worker Mock Service` berfungsi secara deterministik dan terpisah dari komponen 3D.
- **Kriteria Tahap 3 (3D Scene & Camera)**:
  - Kanvas 3D merender dalam perspektif ortografik/isometrik yang tajam.
  - Kontrol *Pan*, *Zoom*, dan *Reset Camera* berfungsi mulus tanpa membuat gedung menghilang dari viewport.
  - Pencahayaan dan atmosfer warna sesuai arah seni *Futuristic Corporate Sci-Fi* (base gelap graphite/navy + aksen cyan/blue/violet).
- **Kriteria Tahap 4 (Office Building & 7 Rooms)**:
  - Ketujuh ruangan departemen (*Reception, Research, Analysis, Strategy, Trading Ops, Market Monitoring, Archive*) terlihat jelas dari kamera default dan terhubung oleh koridor tengah.
  - Label nama ruangan dan departemen terbaca jelas pada zoom standar, dan setiap *workstation* dapat diklik untuk memilih pekerja terkait.
- **Kriteria Tahap 5 (Worker Avatar & Animation)**:
  - Komponen `WorkerAvatar` bersifat modular, mendukung konfigurasi `modelUrl`/`animationMap`/`fallbackType`/`accentColor`, dan menampilkan *Articulated Humanoid Placeholder* berlabel jujur.
  - Pose dan gerakan avatar (`idle`, `seated`, `typing`, `walking`, `talking`) berubah secara sinkron mengikuti status pekerja/tugas tanpa memicu React re-render per-frame.
- **Kriteria Tahap 6 (Interaction & Overlay UI)**:
  - Klik pada avatar/workstation 3D maupun kontrol HTML membuka `WorkerPanel` yang menampilkan identitas, role, departemen, status Worker vs status Task, daftar antrean (*task queue*), riwayat aktivitas, serta metrik token & biaya yang berlabel `SIMULATED`.
  - Tombol **Assign Mock Task** dan **Pause/Resume** berfungsi nyata memodifikasi antrean/status di Zustand store, dan `ActivityFeed` menampilkan aliran event simulasi secara langsung.
- **Kriteria Tahap 7 (Verification & Documentation)**:
  - Unit test deterministik (`npx --yes tsx --test src/workers/simulation.engine.test.ts`) lulus 100%.
  - TypeScript typecheck dan `npm run build` berhasil tanpa error.
  - Interaksi kanvas 3D dan kontrol UI terverifikasi di browser nyata tanpa runtime console error.
  - `docs/PROJECT_STATE.md` diperbarui secara faktual sesuai hasil pemeriksaan aktual.
