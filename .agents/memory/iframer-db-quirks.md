---
name: i-framer MySQL DB quirks
description: Non-obvious schema/units/performance facts about the shared i-framer MySQL database (framer portals, sales, cutting lists)
---

# i-framer DB quirks

- **Component cut dimensions are stored in METRES.** `matboardline`/`backingline`/`coveringline`/`mouldingline` `TotalWidth`/`TotalHeight` need ×1000 for mm (e.g. 0.40000 = 400mm). Board type dims elsewhere may be in the item's `Unit` ("in" needs ×25.4).
- **Join chain for cutting lists:** `sale` → `job` (SaleID) → `jobline` (JobID) → shared-PK siblings: `saleline.ID = jobline.ID = matboardline/backingline/mouldingline/coveringline.ID`. `saleline.JobID` is usually NULL — never rely on it; go through `jobline`.
- **Why:** discovered via live probes; a direct `sale×job` unfiltered join timed out (`job` ~2M rows, `saleline` huge).
- **How to apply:** always narrow by FramerID/SaleID/JobID first (e.g. fetch recent sale IDs, then `IN (...)` joins). Portal subdomain = `framer.Slug`; all ~1k framers share one `iframer` DB.
- **Sale lifecycle enum:** `sale.SaleType` 0 = quote (default on creation), 1 = order, 2 = invoice. The i-framer cutting list report includes only orders + invoices (`SaleType IN (1,2)`) with jobs `Completed = 0 AND Collected = 0`.
- **Glass has no dedicated table for lines, but SHEET SIZES live in `covering`** — glass/glazing cut lines are `coveringline`; the board/sheet dimensions for glass item types are in `covering` (same shape as `matboard`/`backing`: SheetWidth/SheetHeight/SheetSizeUnit). Item types: moulding = linear cuts; backing + glass (+matboard) = sheet cuts.
- **`SheetSizeUnit` can be mm, in, m, cm, or ft** — all five occur in live data. Convert all of them; treating everything as mm-or-in silently drops metre-based boards (e.g. 1.0 m → 1 mm, filtered out) and made stock sheet search "find nothing" for those items. Don't pre-filter raw `SheetWidth > 1` in SQL — metre values are legitimately ≤ 1.
- **Moulding bar lengths + `item.Stock` are in `item.Unit` (m/ft/in), NOT `moulding.WidthUnit`** — `WidthUnit` describes the profile width. `DefaultMouldingLength` is often 0 even for stocked items; `Stock` for mouldings = total length on hand (fractional metres), not bar count. Convert via `item.Unit` and derive bar counts (or fall back to a 3 m standard bar).
- **Item codes are duplicated across framers** (and global rows with `FramerID IS NULL`, some Deleted). Exact-code lookups must scope to the portal's framer (`FramerID = ? OR FramerID IS NULL`, framer-owned rows ranked first) or you match another framer's empty record.
- Jobs with ArtworkWidth > 0 are real framing jobs; others are labour/equipment lines.
- A moulding/frame line represents a rectangular frame: linear cutting needs 2 bars of each dimension per copy.
- Env resolution: `DB_` prefix = dev, `DB_BETA_` = beta, `DB_PROD_` = prod (see api-server iframerDb).
