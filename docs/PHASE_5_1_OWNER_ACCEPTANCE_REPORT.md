# SIREADER Phase 5.1 — Owner Acceptance Report

**Date:** 2026-11-09  
**Branch:** `phase-5-implementation`  
**Frontend Commit:** `96aa4a8755193e16e37b912dd3f14cf825fb2400`  
**Backend Commit:** `988bc32fc5dc83fe25bb29d8557f82a21ffc3842`  
**CI Verification Run:** GitHub Actions run `42615872014` (**SUCCESS**)  
**Local Test Environment:** Windows 11, Local Disposable PostgreSQL 16.6 (`127.0.0.1:5432`), Python 3.12, Node/Bun  
**Overall Acceptance Status:** **PASS (ALL 9 CRITERIA VERIFIED WITH EMPIRICAL PROOF)**

---

## 1. Repositories, Branches & Sync Status

Kedua repositori diverifikasi pada branch `phase-5-implementation`:

| Repository | Branch | Commit | Remote Tracking | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Virtual Office (Frontend/BFF)** | `phase-5-implementation` | `96aa4a8` | `origin/phase-5-implementation` | Synced (Pushed) |
| **Python Backend** | `phase-5-implementation` | `988bc32` | `origin/phase-5-implementation` | Synced (Clean) |

- **Aturan Merge:** Tidak ada merge ke `main`.
- **Aturan Git:** Tidak ada operasi destruktif (`git reset`, `git clean`). Seluruh file untracked lokal pengguna tersimpan utuh.

---

## 2. CI Verification Gates

### Frontend & BFF (`SIREADER`)
- **GitHub Actions Run:** `42615872014` (`push` on `phase-5-implementation` @ `96aa4a8`)
  - Automated test suite: **PASSED**
  - TypeScript typecheck (`tsc --noEmit`): **PASSED**
  - Production build (`vite build`): **PASSED**

### Python Backend (`SIREADER-Python-Backend`)
- **GitHub Actions Run:** `42605004720` (`push` on `phase-5-implementation` @ `988bc32`)
  - Python lint & unit tests: **PASSED**

---

## 3. Local Architecture & Hard Boundaries

Sesuai dengan runbook `docs/PHASE_5_LOCAL_COMMAND_API_RUNBOOK.md`:
1. **Local Disposable PostgreSQL 16.6 (`127.0.0.1:5432`):**
   - Database: `sireader_local` dengan self-signed SSL aktif (`sslmode=require`).
   - Role least-privilege: `sireader_workforce_cmd` (khusus tabel audit dan scheduling workforce) dan `sireader_api_ro` (read-only view API).
   - **TIDAK MENYENTUH** instance Supabase LIVE (`otinrvvfjnyxjvzcmdia`).
2. **Command API Service (`127.0.0.1:8010`):**
   - Dijalankan via `python -m app.command_api.process`.
   - Melayani endpoint `/api/v1/commands/tasks/enqueue`, `/api/v1/commands/tasks/cancel`, `/api/v1/commands/tasks/retry`, `/api/v1/commands/workers/scheduling`.
   - Menggunakan token server-to-server `SIREADER_WORKFORCE_COMMAND_AUTH_TOKEN`.
3. **Observability API (`127.0.0.1:8000`):**
   - Dijalankan via `python -m app.api.server`.
   - Menyediakan snapshot workforce dan SSE event stream terinvalidation secara live.
4. **Express BFF (`127.0.0.1:3001`) & Vite Frontend (`127.0.0.1:3000`):**
   - Melayani Single Page Application dan mem-proxy namespace `/api` dengan validasi CSRF token dan Origin check.
5. **Hard Boundaries Verification:**
   - Provider berbayar: **TIDAK DIAKTIFKAN** (hanya task generic non-trading Haiku/Summarization).
   - MT5, HFM, order, dan trading approval: **TIDAK DISENTUH**.
   - Secret, token, dan URL database: **TIDAK DIBOCORKAN KE BROWSER**.

---

## 4. Hasil Pengujian Browser Acceptance (CDP Automation)

Pengujian interaksi browser dijalankan secara otonom melalui Chrome DevTools Protocol (`scratch/browser_acceptance_phase5.py`):

| # | Skenario Uji | Kriteria Verifikasi | Status | Bukti Screenshot |
| :-: | :--- | :--- | :-: | :--- |
| **1** | **DEMO Mode Initial State** | Aplikasi terbuka di `http://127.0.0.1:3000` dalam mode DEMO. Operator command console (`[aria-label="Human-supervised workforce commands"]`) **tidak muncul** di DOM. | **PASS** | `phase5_01_live_command_console.png` |
| **2** | **LIVE Mode & Operator Authentication** | Beralih ke mode LIVE. Form login operator diisi dan disubmit. Sesi bertransisi ke `AUTHENTICATED`. Command console muncul. Kartu Haiku merender status scheduling `ACCEPTING` dan status proses runtime `OFFLINE` secara terpisah. | **PASS** | `phase5_01_live_command_console.png` |
| **3** | **Enqueue Bounded Generic Task** | Task non-trading generic dipilih (`haiku` + `summarization` + instruction). Tombol *Create task* diklik. Muncul notifikasi: `Task accepted · <task_id>`. Task tercatat di store dengan status `QUEUED` dan tombol *Cancel* muncul di DOM. | **PASS** | `phase5_02_task_enqueued.png` |
| **4** | **Cancel Task Pre-Provider** | Tombol Cancel pada task baru diklik sebelum reservasi provider. Muncul notifikasi: `Task cancelled before a provider request`. Status task di live store diperbarui menjadi `CANCELLED`. | **PASS** | `phase5_03_task_cancelled.png` |
| **5** | **Pause & Resume Worker Scheduling** | Tombol scheduling Haiku diklik. Notifikasi `Worker scheduling · PAUSED` muncul, kartu Haiku menampilkan `Scheduling: PAUSED` sementara status proses tetap `OFFLINE`. Tombol diklik kembali untuk resume; kartu kembali menampilkan `Scheduling: ACCEPTING`. | **PASS** | `phase5_04_worker_paused.png`<br>`phase5_05_worker_resumed.png` |
| **6** | **Retry Safe Fixture Task** | Fixture aman gagal `phase5-retry-fixture-0001` (tanpa provider request) di-retry melalui tombol Retry. Muncul notifikasi: `New retry task created · <new_task_id>`. Task baru berstatus `QUEUED` dengan `retry_of_task_id` merujuk ke fixture, sementara task fixture asli tetap `FAILED`. | **PASS** | `phase5_06_task_retried.png` |
| **7** | **Return to DEMO Mode** | Mode beralih kembali ke DEMO. Command console segera di-unmount dari DOM. Selama mode DEMO, tepat **0** POST request dikirim ke endpoint `/api/v1/commands/*`. | **PASS** | `phase5_07_demo_mode_isolated.png` |
| **8** | **Operator Logout & Data Wipe** | Mode kembali ke LIVE dan tombol Logout diklik. Sesi operator beralih ke `UNAUTHENTICATED`. Seluruh data runtime workforce privat (`/api/v1/workforce/runtime`, `tasks`, `activity`) dibersihkan (`null`) dari memori store. | **PASS** | `phase5_08_logout_cleared.png` |
| **9** | **DevTools Security & Credential Audit** | Panggilan browser langsung ke port backend command `8010`: **0** (seluruhnya melalui BFF same-origin). Nilai `localStorage` & `sessionStorage` tidak memuat database URL, role, atau token. Console errors: **0**. | **PASS** | `phase5_acceptance_results.json` |

---

## 5. Bug yang Ditemukan dan Diperbaiki

- **Isu:** Target ID Mismatch pada respons command `TASK_RETRY`.
- **Deskripsi:** Backend Python Command API membuat baris task baru untuk setiap retry yang valid (sesuai prinsip idempotensi dan non-requeueing gagal) dan mengembalikan task ID baru sebagai `target_id`. Sementara itu, validator BFF (`server/commands.ts`) dan kontrak frontend (`src/live/live.contracts.ts`) sebelumnya mengecek `target_id` terhadap `body.task_id` (ID task lama). Hal ini menyebabkan respons yang sukses ditolak dengan error `SCHEMA_INVALID`.
- **Solusi:** Menyesuaikan penentuan `expectedTarget` pada kedua file sehingga untuk command `/api/v1/commands/tasks/retry`, `expectedTarget` menerima ID task baru dari respons (`response.target_id` / `value.target_id`), sembari tetap memvalidasi `outcome.retry_of_task_id === body.task_id`.
- **Commit:** `96aa4a8755193e16e37b912dd3f14cf825fb2400`.

---

## 6. Verifikasi Immutability & Audit Database

Pemeriksaan langsung pada tabel `public.workforce_command_audit` di PostgreSQL lokal:
- Setiap perintah (`TASK_ENQUEUE`, `TASK_CANCEL`, `WORKER_SCHEDULING_SET`, `TASK_RETRY`) tercatat secara permanen dengan actor `local_operator`, hash SHA-256 request fingerprint, dan correlation ID.
- Upaya pengubahan/penghapusan baris audit ditolak oleh trigger `sireader_reject_command_audit_mutation_v1` dengan pesan error: `ERROR: workforce command audit is append-only`.

---

## 7. Status Akhir Phase 5.1

Dengan seluruh bukti pengujian lokal Windows/Chrome, bukti immutable audit trail, perbaikan bug kontrak, dan kelolosan CI GitHub Actions (`42615872014`), **Phase 5.1 resmi dinyatakan COMPLETE**.
