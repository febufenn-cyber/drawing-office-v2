# DO-019 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1) and the sibling sheets, and roads not
taken. Everything that could become a decision is on the sheet; this file
holds what could not.

## Contradictions found in the parent doc and sibling sheets

1. **Two owners for the spend ledger.** DO-012 P6 capability-vault holds "the
   spend ledger" and owns `debit` and `month_spent`, while the register says
   DO-019 owns "the budget ledger that DO-012 and DO-020 read." Both sheets
   cannot own the durable ledger. DO-019 resolves it here: the budget-ledger
   (P8) is the durable per-workspace store of credential scope, caps, and
   append-only spend entries, and DO-012's vault is its client across the
   boundary — the vault debits and reads month_spent through DO-019, it does
   not persist a second ledger. DO-012's next revision must flip its P6 ledger
   from an owned store to a boundary read against DO-019, or the two sheets
   double-count spend.

2. **Credentials are local per §P6 but owned by L4.** The architecture's §P6
   lists "Memory, credentials, skills, and workspaces" together as local and
   encrypted, yet the vault that holds credentials is L4 (DO-012). DO-019
   resolves the split cleanly: the workspace holds the credential *scope* (the
   origins and max tier a workspace may use) as a field; the credential
   *material* lives in DO-012's vault. This sheet never stores a secret. The
   parent doc reads as if L3 held the credentials themselves.

3. **Encryption key provenance is asserted, not sited.** DO-012 P6 and DO-013
   both consume "a per-workspace key provisioned by L3," but neither the
   architecture nor those sheets say where the master key that seeds the
   derivation comes from. DO-019 sites it in an owner-only master keyring file
   and derives per-workspace keys by HKDF. The master-key source itself (file
   versus OS keychain) is an open question below.

## Open questions (no decision possible at this revision)

1. **Master key backup and recovery under strict local-first.** "No cloud
   copy in v0" means a lost or corrupted master keyring makes every workspace
   partition permanently unreadable. Whether v0 ships any local escrow — a
   passphrase-wrapped export the user stores themselves — trades the
   local-first guarantee against total-loss risk. Left unresolved until the
   threat model for device loss is written.

2. **Embedding model and dimension drift.** The vector-index fixes embedding
   dimension per store at initialization, but the embeddings come from the L2
   model router (DO-017), whose model can change. A model swap that changes
   dimension or vector space silently degrades recall across every existing
   episode and entity. Whether DO-019 versions the embedding space and
   triggers re-embedding, or DO-017 guarantees a stable space, needs a joint
   decision with DO-017.

3. **Entity-graph schema openness.** "Things the user tracks" spans products,
   flights, and leads with no fixed shape. The sheet keeps `attributes` an
   open object and `kind` a free string. How much structure to impose — a
   typed entity registry versus fully freeform nodes — is deferred until real
   entity traffic exists to shape it.

4. **Cross-workspace skill sharing.** The architecture's Phase 3 names a
   shareable community skill library, but v0 keeps every skill partition-local
   for isolation. The path from a partition-local skill-store to a shared
   library — and what encryption and provenance a shared skill carries — is
   out of scope until the isolation model for shared parts is designed.

## Roads not taken

- **One shared database with a workspace_id column.** Rejected in favor of one
  encrypted database file per workspace. Row-level filtering makes isolation a
  property of every query being correct; a single missing predicate leaks
  across workspaces. Separate encrypted files with separate keys make
  isolation structural, and they align one-to-one with DO-013's Electron
  session partitions and DO-012's per-workspace keys.

- **Approximate nearest-neighbor index (HNSW or IVF).** Rejected for v0. A
  workspace's episodic and entity corpora are small, sqlite-vec brute-force
  kNN is exact and simple, and exactness removes recall as a tolerance to
  argue about. An approximate index is revisited only when a single partition
  outgrows the Op 110 latency budget.

- **Full-text search over episodic memory.** Not built. Vector similarity plus
  structured filters over task_ref, outcome, and time window cover v0 recall;
  a text index is additive and deferred.

- **Secure erase of partition data files on delete.** Rejected as redundant.
  Deleting the derived key renders the AEAD-encrypted partition
  indistinguishable from random, so overwriting the ciphertext buys nothing;
  zeroizing the keyring entry is the whole deletion guarantee.

- **OS keychain for the master key.** The master keyring is an owner-only file,
  matching the posture DO-012 chose for its vault keys and portable across the
  three target platforms. Keychain integration is an implementation upgrade
  that changes no contract on this sheet.

- **Storing embeddings outside the encrypted partition for speed.** Rejected.
  An embedding leaks the content it encodes; keeping the vector virtual tables
  inside the same encrypted partition as their rows keeps the isolation and
  encryption guarantees whole, at the cost of no cross-partition index.
