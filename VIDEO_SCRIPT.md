# VIDEO SCRIPT — DCA Guardian Agent (Post-Quantum AI Agents)

- **Kategori:** Post-Quantum AI Agents · **Status:** LIVE di Diana (chainId 9800)
- **Kontrak:** `GuardianVault` — `0xe60A81a25De2115837218D59745942e94aB38Ae8` · **Agent:** `0x1151197c547538804783DFA6DDd8cb8291Db91c7`
- **Target durasi:** 2:30–2:55 (maksimum contest 3:00) · **Kecepatan baca acuan:** ~130 kata/menit
- **Jumlah kata narasi:** 347 kata · **Estimasi durasi baca:** ±2:40
- **Bahasa narasi:** Inggris (juri internasional). Hash dibaca bentuk pendek saja.
- **Kejujuran wajib:** narasi TIDAK mengklaim abstract account (Layer C) live — itu runbook belum dieksekusi; jangan improvisasi klaim itu saat rekam.

## Tabel segmen

| Segmen | Waktu | Durasi | Isi | Kata |
|---|---|---|---|---|
| 1 | 0:00–0:16 | ±16 dtk | Hook — agent + wallet = risiko | 34 |
| 2 | 0:16–1:46 | ±90 dtk | Demo — dashboard, breaker, cap | 196 |
| 3 | 1:46–2:14 | ±28 dtk | Bukti on-chain — scoped window + executeDca | 60 |
| 4 | 2:14–2:32 | ±18 dtk | Keamanan — NotAgent revert live | 38 |
| 5 | 2:32–2:41 | ±9 dtk | Penutup — syarat kategori | 19 |

---

## Naskah narasi (voice-over)

### [0:00–0:16] Segmen 1 — Hook

> Give an AI agent a wallet, and one leaked key or one bad prompt can empty it. DCA Guardian's agent trades autonomously — but its limits live in a contract, not in a prompt.

### [0:16–1:46] Segmen 2 — Demo alur utama

> This is the agent's dashboard, generated from its own decision log. The agent dollar-cost-averages on a schedule. Watch a price spike arrive: the decision flips to hold — the volatility circuit-breaker — twice. Then the daily cap stops it entirely for the day. Every decision is a pure function of price, time, and the vault's on-chain state. Under the hood: the agent's key can call exactly one function, executeDca, on exactly one vault. The vault enforces a per-transaction cap, a daily cap in an explicit UTC day bucket, a minimum interval, and the breaker — against one immutable AMM and one immutable pair. The agent cannot withdraw, ever. Remote commands to the agent must arrive as ML-DSA-87-signed messages with nonces and expiry — forged, replayed, or stale commands are rejected by the agent itself, as its eighteen tests show. And if the owner ever needs the final word, the kill-switch ends the agent permanently — and firing it requires the owner's own ML-DSA-87 signature, verified by the chain's pqcVerify precompile. This is not a concept video: the vault is deployed, and the agent you're watching has already traded inside these exact limits on the live testnet.

### [1:46–2:14] Segmen 3 — Bukti on-chain

> Verify it on-chain. The agent account registered its ML-DSA key as its first transaction, then opened a scoped EVM window — read it from the chain API: live, forty-eight transactions, and allowed targets containing exactly one address, the vault. Inside that window, the project's own agent code executed executeDca: execution count one, funds moved at zero basis points of deviation.

### [2:14–2:32] Segmen 4 — Keamanan

> We tried to break the leash live: the owner — not the agent — called executeDca, and the transaction reverted on-chain with NotAgent. Thirty-four contract tests cover cap breaches, replay, forged kill-switches, and the agent trying to withdraw.

### [2:32–2:41] Segmen 5 — Penutup

> DCA Guardian: an autonomous agent that cannot be drained — live on Diana for the Post-Quantum AI Agents track.

---

## Shot list per segmen

**Segmen 1 — Hook (0:00–0:16)**
- Layar: featured image, lalu dashboard agent (status, kill-switch OFF, breaker).
- Overlay: "limits in a contract, not in a prompt".

**Segmen 2 — Demo (0:16–1:46)**
- Pra-shot terminal: `cd agent && npm run simulate` menghasilkan data + decision log (JSONL).
- Layar: frontend dashboard (`cd frontend && npm run dev`, http://localhost:5173):
  - Gulir decision log: siklus BUY terjadwal → lonjakan harga → **HOLD (circuit-breaker)** ×2 → **STOP di daily cap 250** persis.
  - Sorot cap bar vault (per-tx 100 / harian 250), status breaker, posisi vault.
  - Buka cuplikan log demo perintah: perintah pause bertanda tangan valid = *accepted*, replay = *replay-or-stale-nonce*, forged = *bad-signature*.
  - Panel "3 lapis leash": scoped window (chain) → aturan kontrak vault → (Layer C abstract account ditandai **runbook**, jangan tampilkan sebagai live).

**Segmen 3 — Bukti on-chain (1:46–2:14)**
- Layar: browser REST window agent: `https://api-testnet.qore.host/qorechain/pqc/v1/evm_window/qor1z9g3jlz5w5ugq3urm7ndmkxts2gahyw8y4xm69` → `live:true`, `allowed_targets:["0xe60a81a2…ae8"]`, max_txs 48, used_txs ≥1.
- REST PQC agent: `GET /qorechain/pqc/v1/account/qor1z9g3jlz5w5ugq3urm7ndmkxts2gahyw8y4xm69` → found:true, possession_proven:true; tx register (tx pertama) `E27F69B5…21603`, tx buka window `E8906CDF…A8C19`.
- Explorer (Testnet): vault `0xe60A81a25De2115837218D59745942e94aB38Ae8` (deploy `0xfa009b3b…7935c`) dan tx executeDca agent `0xe45ebd237c56dd79145aca297d24f9cf2fb3a110fb12512a8fd779f0ce154da0` (block 10087908) → executionCount 1.

**Segmen 4 — Keamanan (2:14–2:32)**
- Layar: explorer — tx negatif `0x617413fca9e75e359ffe4096b125f6b870298d2e1d458570afcaab3b48e1a6ec` status **reverted** (error NotAgent), block 10087922.
- Potong ke terminal: `npx hardhat test` → "34 passing" + `cd agent && npm test` → "18 passing".

**Segmen 5 — Penutup (2:32–2:41)**
- Layar: dashboard dengan log eksekusi on-chain + alamat vault; fade out.

---

## Aset yang disiapkan sebelum rekam

1. Tab REST terbuka & termuat: window agent (`/qorechain/pqc/v1/evm_window/qor1z9g3…xm69`) dan PQC account agent (`/qorechain/pqc/v1/account/qor1z9g3…xm69`) — dua bukti terpenting kategori ini, pastikan terbaca `live:true` + allowed_targets hanya vault.
2. Tab explorer (Testnet): vault `0xe60A81a25De2115837218D59745942e94aB38Ae8`; tx executeDca `0xe45ebd23…54da0`; tx negatif NotAgent `0x617413fc…a6ec`.
3. Simulasi dijalankan sebelum rekam (`npm run simulate` di `agent/`) agar dashboard terisi data keputusan terbaru; frontend berjalan di port 5173.
4. File decision log JSONL (`agent/data/`) siap ditampilkan, termasuk baris eksekusi testnet dengan tx hash.
5. Terminal siap dua perintah: `npx hardhat test` (root) dan `npm test` (di `agent/`).
6. Clipboard berurutan: alamat vault → alamat agent EVM → hash executeDca → hash negatif.
7. Catatan kejujuran: kill-switch live sengaja TIDAK ditembak (vault harus tetap hidup untuk juri) — narasi hanya menyebut mekanismenya + cakupan test; token live adalah pasangan demo dgUSD/dgETH (dinyatakan terbuka di README) — jangan sebut fUSD/fETH sebagai pasangan live di video.
