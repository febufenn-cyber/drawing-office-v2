"""Conformance validator for Drawing Standard rev C LLD.md files.

Enforces the machine-checked rules in STANDARD.md (rev C). Stdlib only.

Usage: python tools/validate.py <path> [<path>...]
Each path is a directory (recursively globbed for LLD.md) or a file.
Errors go to stdout as `path:line: E### message`, sorted by (path, line).
Exit 1 if any errors, 0 if clean, 2 on usage problems.

The validator checks form, never substance: a citation's presence and
format, not its resolution; a basis label's existence, not its honesty;
a falsifier op's existence in the plan, not its teeth.
"""

import os
import re
import sys

USAGE = 'usage: python tools/validate.py <path> [<path>...]'

CANONICAL_KEYS = [
    'id', 'title', 'revision', 'status', 'author',
    'reviewed_by', 'date', 'part_count', 'supersedes',
]

DERIVED_KEYS = ['source', 'source_rev', 'subject', 'derived_by']

REQUIRED_SECTIONS = [
    '## ASSEMBLY DRAWING',
    '## BILL OF MATERIALS',
    '## DETAIL DRAWINGS',
    '## CONTRACTS & TOLERANCES',
    '## PROCESS PLAN',
    '## REVISION HISTORY',
]

FENCE_RE = re.compile(r'^\s{0,3}`{3,}')
MERMAID_FENCE_RE = re.compile(r'^\s{0,3}`{3,}[ \t]?mermaid\b')
H2_RE = re.compile(r'^##\s+')
H3_RE = re.compile(r'^###\s+')
H3_DETAIL_RE = re.compile(r'^###\s+(P[0-9]+)\b')
ID_RE = re.compile(r'DO-[0-9]{3}')
REVISION_RE = re.compile(r'[A-Z]+')
DATE_RE = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}')
INT_RE = re.compile(r'[0-9]+')
PART_RE = re.compile(r'P[0-9]+')
HASH_RE = re.compile(r'[0-9a-f]{40}|[0-9a-f]{64}')
OP_REF_RE = re.compile(r'Op\s+([0-9]+)')
COMMODITY_RE = re.compile(r'commodity part', re.IGNORECASE)
EXTERNAL_RE = re.compile(r'external part\s*[—–-]*\s*see\s+DO-[0-9]{3}',
                         re.IGNORECASE)
SOURCE_ANCHOR_RE = re.compile(r'^Source:\s+\S')

# The complete rejection set for tolerance cells: empty, hyphen, em/en dash.
DASH_CELLS = {'', '-', '—', '–'}

STATUSES = {'draft', 'released', 'superseded'}
BASES = {'observed', 'documented', 'inferred', 'unknown'}
CITATION_RE = re.compile(
    r'^(code|commit|doc|issue|searched)\s+\S.*$')


def parse_cells(line):
    """Strip outer pipes, split on |, strip whitespace from each cell."""
    s = line.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    return [c.strip() for c in s.split('|')]


def is_separator_row(line):
    """A separator row's cells contain only dashes, colons, and spaces."""
    return all(set(cell) <= set('-: ') for cell in parse_cells(line))


def scan_fences(lines):
    """Return (fenced, mermaid_lines).

    fenced[i] is True when 0-based line i is a fence delimiter or inside a
    fence. mermaid_lines is a list of 1-based line numbers of fence lines
    that open a mermaid block.
    """
    fenced = [False] * len(lines)
    mermaid_lines = []
    in_fence = False
    for i, line in enumerate(lines):
        if FENCE_RE.match(line):
            if not in_fence and MERMAID_FENCE_RE.match(line):
                mermaid_lines.append(i + 1)
            in_fence = not in_fence
            fenced[i] = True
        else:
            fenced[i] = in_fence
    return fenced, mermaid_lines


def find_tables(lines, fenced, start, end):
    """Find pipe tables between 1-based lines start..end inclusive.

    A table is 2+ consecutive non-fenced lines starting with optional
    whitespace then |, where the second line is a separator row. Returns
    dicts with 1-based 'header' line and 'data' line list.
    """
    tables = []
    i = start
    while i <= end:
        if not fenced[i - 1] and lines[i - 1].lstrip().startswith('|'):
            j = i
            while (j <= end and not fenced[j - 1]
                   and lines[j - 1].lstrip().startswith('|')):
                j += 1
            # Run covers 1-based lines i..j-1; second line is line i+1.
            if j - i >= 2 and is_separator_row(lines[i]):
                tables.append({'header': i, 'data': list(range(i + 2, j))})
            i = j
        else:
            i += 1
    return tables


def parse_front_matter(lines):
    """Parse the front matter block.

    Returns (entries, close_line, errors). entries maps key -> (value, line)
    for first occurrences of known keys. close_line is the 1-based line of
    the closing --- or None. errors is a list of (line, code, message).
    """
    errors = []
    entries = {}
    known = CANONICAL_KEYS + DERIVED_KEYS
    if not lines or lines[0].strip() != '---':
        errors.append((1, 'E101', 'front matter block missing at line 1'))
        return entries, None, errors
    close_line = None
    for i in range(1, len(lines)):
        if lines[i].strip() == '---':
            close_line = i + 1
            break
    if close_line is None:
        errors.append((1, 'E102', 'front matter never closed'))
        return entries, None, errors
    for i in range(1, close_line - 1):
        ln = i + 1
        raw = lines[i]
        key, sep, value = raw.partition(':')
        key = key.strip()
        value = value.strip()
        if not sep or not key:
            errors.append((ln, 'E103',
                           'malformed front matter line (not key: value)'))
            continue
        if key not in known:
            errors.append((ln, 'E104', 'unknown key ' + key))
            continue
        if key in entries:
            errors.append((ln, 'E105', 'duplicate key ' + key))
            continue
        entries[key] = (value, ln)
        if value == '':
            errors.append((ln, 'E107', 'empty value for key ' + key))
    for key in CANONICAL_KEYS:
        if key not in entries:
            errors.append((close_line, 'E106', 'missing key ' + key))
    # E116: derived keys are all-or-none.
    present = [k for k in DERIVED_KEYS if k in entries]
    if present and len(present) != len(DERIVED_KEYS):
        missing = [k for k in DERIVED_KEYS if k not in entries]
        errors.append((close_line, 'E116',
                       'derived title-block keys are all-or-none; missing '
                       + ', '.join(missing)))
    # E117: source_rev is a full lowercase 40- or 64-char hash.
    item = entries.get('source_rev')
    if item is not None and item[0] != '' and not HASH_RE.fullmatch(item[0]):
        errors.append((item[1], 'E117',
                       'source_rev is not a full 40- or 64-character '
                       'lowercase hash'))
    return entries, close_line, errors


def check_front_matter_values(entries):
    """Format checks E108, E110-E115 on present, non-empty values."""
    errors = []

    def get(key):
        item = entries.get(key)
        if item is not None and item[0] != '':
            return item
        return None

    v = get('id')
    if v and not ID_RE.fullmatch(v[0]):
        errors.append((v[1], 'E108', 'id does not match DO-NNN (three digits)'))
    v = get('status')
    if v and v[0] not in STATUSES:
        errors.append((v[1], 'E110',
                       'status not one of draft|released|superseded'))
    v = get('revision')
    if v and not REVISION_RE.fullmatch(v[0]):
        errors.append((v[1], 'E111', 'revision is not capital letters'))
    v = get('date')
    if v and not DATE_RE.fullmatch(v[0]):
        errors.append((v[1], 'E112', 'date does not match YYYY-MM-DD'))
    v = get('part_count')
    if v and not (INT_RE.fullmatch(v[0]) and int(v[0]) > 0):
        errors.append((v[1], 'E113', 'part_count not a positive integer'))
    v = get('supersedes')
    if v and v[0] != 'none' and not ID_RE.fullmatch(v[0]):
        errors.append((v[1], 'E114',
                       'supersedes neither none nor DO-NNN'))
    status = get('status')
    reviewed = get('reviewed_by')
    if status and reviewed and status[0] == 'released' and reviewed[0] == 'none':
        errors.append((reviewed[1], 'E115',
                       'status released but reviewed_by is none'))
    return errors


def split_citations(cell):
    """Split an Evidence cell on `;` into stripped citation strings."""
    return [c.strip() for c in cell.split(';') if c.strip()]


def validate_file(path, text):
    """Validate one LLD file.

    Returns (errors, own_id, refs) where errors is a list of
    (path, line, code, message), own_id is the drawing id or None, and refs
    is a list of (ref_id, line) from the BOM Ref column.
    """
    lines = text.splitlines()
    raw = []

    entries, close_line, fm_errors = parse_front_matter(lines)
    raw.extend(fm_errors)

    is_derived = all(k in entries for k in DERIVED_KEYS)

    part_count = None
    part_count_line = None
    own_id = None
    if close_line is not None:
        raw.extend(check_front_matter_values(entries))
        item = entries.get('part_count')
        if item and INT_RE.fullmatch(item[0]) and int(item[0]) > 0:
            part_count = int(item[0])
            part_count_line = item[1]
        item = entries.get('id')
        if item and item[0] != '':
            own_id = item[0]

    content_start = close_line + 1 if close_line is not None else 1
    fenced, mermaid_lines = scan_fences(lines)

    # --- Sections (E201-E203) ---
    h2s = []
    for i in range(content_start - 1, len(lines)):
        if not fenced[i] and H2_RE.match(lines[i]):
            h2s.append((i + 1, lines[i].strip()))
    h2_lines = [ln for ln, _ in h2s]

    expected_seen = set()
    ordered_found = []
    for ln, title in h2s:
        if title in REQUIRED_SECTIONS and title not in expected_seen:
            expected_seen.add(title)
            ordered_found.append((ln, title))
        else:
            raw.append((ln, 'E203', 'unexpected extra section: ' + title))
    eof_line = len(lines) if lines else 1
    for title in REQUIRED_SECTIONS:
        if title not in expected_seen:
            raw.append((eof_line, 'E201',
                        'missing required section: ' + title))
    want = [t for t in REQUIRED_SECTIONS if t in expected_seen]
    got = [t for _, t in ordered_found]
    if got != want:
        for (ln, title), expected_title in zip(ordered_found, want):
            if title != expected_title:
                raw.append((ln, 'E202', 'required sections out of order'))
                break

    first_occurrence = {title: ln for ln, title in ordered_found}

    def section_span(title):
        """(heading_line, last_line) of a section, or None if missing."""
        if title not in first_occurrence:
            return None
        start = first_occurrence[title]
        following = [l for l in h2_lines if l > start]
        end = min(following) - 1 if following else len(lines)
        return start, end

    # --- ASSEMBLY DRAWING (E301) ---
    span = section_span('## ASSEMBLY DRAWING')
    if span is not None:
        head, end = span
        if not any(head < ml <= end for ml in mermaid_lines):
            raw.append((head, 'E301', 'no mermaid fence in ASSEMBLY DRAWING'))

    # --- BILL OF MATERIALS (E401-E407) ---
    bom_rows = []          # (part, line) per data row, in order
    bom_part_set = set()
    bom_present = False
    refs = []              # (ref_id, line) for DO-NNN refs
    span = section_span('## BILL OF MATERIALS')
    if span is not None:
        head, end = span
        tables = find_tables(lines, fenced, head + 1, end)
        if not tables:
            raw.append((head, 'E401', 'no table in BILL OF MATERIALS'))
        else:
            bom_present = True
            table = tables[0]
            header_cells = parse_cells(lines[table['header'] - 1])
            ref_idx = None
            for ci, cell in enumerate(header_cells):
                if cell.lower() == 'ref':
                    ref_idx = ci
            if ref_idx is None:
                raw.append((table['header'], 'E406',
                            'BOM table has no Ref column'))
            seen_parts = set()
            for row_ln in table['data']:
                cells = parse_cells(lines[row_ln - 1])
                part = cells[0] if cells else ''
                bom_rows.append((part, row_ln))
                bom_part_set.add(part)
                if not PART_RE.fullmatch(part):
                    raw.append((row_ln, 'E402',
                                'BOM part number does not match P<digits>: '
                                + repr(part)))
                elif part in seen_parts:
                    raw.append((row_ln, 'E403',
                                'duplicate BOM part number ' + part))
                seen_parts.add(part)
                if ref_idx is not None:
                    ref = cells[ref_idx] if ref_idx < len(cells) else ''
                    if ref == 'local':
                        pass
                    elif ID_RE.fullmatch(ref):
                        refs.append((ref, row_ln))
                        if own_id is not None and ref == own_id:
                            raw.append((row_ln, 'E407',
                                        'ref cites the drawing\'s own id'))
                    else:
                        raw.append((row_ln, 'E405',
                                    'ref cell neither local nor DO-NNN: '
                                    + repr(ref)))
            if part_count is not None and part_count != len(table['data']):
                raw.append((part_count_line, 'E404',
                            'part_count %d does not equal BOM data-row '
                            'count %d' % (part_count, len(table['data']))))

    # --- DETAIL DRAWINGS (E501-E504) ---
    span = section_span('## DETAIL DRAWINGS')
    if span is not None:
        head, end = span
        h3s = []  # (line, part-or-None) for every H3 in the section
        for i in range(head, end):
            if fenced[i]:
                continue
            if H3_RE.match(lines[i]):
                m = H3_DETAIL_RE.match(lines[i])
                h3s.append((i + 1, m.group(1) if m else None))
        detail_parts = set()
        for idx, (ln, part) in enumerate(h3s):
            if part is None:
                continue
            detail_parts.add(part)
            if part not in bom_part_set:
                raw.append((ln, 'E503',
                            'detail heading references a part not in the '
                            'BOM: ' + part))
            body_end = h3s[idx + 1][0] - 1 if idx + 1 < len(h3s) else end
            has_mermaid = any(ln < ml <= body_end for ml in mermaid_lines)
            has_commodity = any(COMMODITY_RE.search(lines[j])
                                for j in range(ln, body_end)
                                if not fenced[j])
            has_external = any(EXTERNAL_RE.search(lines[j])
                               for j in range(ln, body_end)
                               if not fenced[j])
            if not has_mermaid and not has_commodity and not has_external:
                raw.append((ln, 'E502',
                            'detail entry has neither a diagram nor a '
                            'commodity or external-part note'))
            if is_derived:
                has_anchor = any(SOURCE_ANCHOR_RE.match(lines[j])
                                 for j in range(ln, body_end)
                                 if not fenced[j])
                if not has_anchor and not has_commodity and not has_external:
                    raw.append((ln, 'E504',
                                'derived detail entry has no Source: anchor '
                                'and is not a commodity or external-part '
                                'note'))
        if bom_present:
            for part, row_ln in bom_rows:
                if part not in detail_parts:
                    raw.append((row_ln, 'E501',
                                'BOM part has no detail heading: ' + part))

    # --- PROCESS PLAN op set (for E606 cross-checks) ---
    process_ops = set()
    span_pp = section_span('## PROCESS PLAN')
    if span_pp is not None:
        head_pp, end_pp = span_pp
        pp_tables = find_tables(lines, fenced, head_pp + 1, end_pp)
        if pp_tables:
            for row_ln in pp_tables[0]['data']:
                cells = parse_cells(lines[row_ln - 1])
                if cells and INT_RE.fullmatch(cells[0]):
                    process_ops.add(cells[0])

    # --- CONTRACTS & TOLERANCES (E601-E611) ---
    span = section_span('## CONTRACTS & TOLERANCES')
    if span is not None:
        head, end = span
        tables = find_tables(lines, fenced, head + 1, end)
        if not tables:
            raw.append((head, 'E601', 'no table in CONTRACTS & TOLERANCES'))
        for table in tables:
            header_cells = parse_cells(lines[table['header'] - 1])
            idx = {}
            for ci, cell in enumerate(header_cells):
                idx[cell.lower()] = ci
            tol_idx = idx.get('tolerance')
            op_idx = idx.get('inspection op')
            basis_idx = idx.get('basis')
            ev_idx = idx.get('evidence')
            if tol_idx is None:
                raw.append((table['header'], 'E602',
                            'contract table has no Tolerance column'))
                continue
            if op_idx is None:
                raw.append((table['header'], 'E604',
                            'contract table has no Inspection-op column'))
            if is_derived and (basis_idx is None or ev_idx is None):
                raw.append((table['header'], 'E607',
                            'derived contract table lacks Basis and '
                            'Evidence columns'))

            def cell_at(cells, i):
                return cells[i] if (i is not None and i < len(cells)) else ''

            for row_ln in table['data']:
                cells = parse_cells(lines[row_ln - 1])

                # E603: tolerance present.
                tol = cell_at(cells, tol_idx)
                if tol in DASH_CELLS:
                    raw.append((row_ln, 'E603',
                                'tolerance cell empty or dash-only'))
                # E605 / E606: inspection-op coverage.
                if op_idx is not None:
                    op_cell = cell_at(cells, op_idx)
                    refs_found = OP_REF_RE.findall(op_cell)
                    if op_cell in DASH_CELLS or not refs_found:
                        raw.append((row_ln, 'E605',
                                    'tolerance cites no Op NN inspection '
                                    'op (coverage gap)'))
                    for num in refs_found:
                        if num not in process_ops:
                            raw.append((row_ln, 'E606',
                                        'inspection op Op %s not in '
                                        'Process Plan' % num))
                # E608-E611: derived-drawing evidence discipline.
                if is_derived and basis_idx is not None and ev_idx is not None:
                    basis = cell_at(cells, basis_idx)
                    ev_cell = cell_at(cells, ev_idx)
                    if basis not in BASES:
                        raw.append((row_ln, 'E608',
                                    'basis not one of '
                                    'observed|documented|inferred|unknown: '
                                    + repr(basis)))
                    citations = split_citations(ev_cell)
                    kinds = []
                    for cit in citations:
                        m = CITATION_RE.match(cit)
                        if not m:
                            raw.append((row_ln, 'E609',
                                        'evidence citation does not match '
                                        'grammar: ' + repr(cit)))
                        else:
                            kinds.append(m.group(1))
                    if not citations:
                        raw.append((row_ln, 'E609',
                                    'evidence cell has no citation'))
                    if basis in BASES:
                        if 'searched' in kinds and basis != 'unknown':
                            raw.append((row_ln, 'E610',
                                        'searched citation permitted only '
                                        'under basis unknown'))
                        if basis == 'observed' and 'code' not in kinds:
                            raw.append((row_ln, 'E610',
                                        'basis observed requires a code '
                                        'citation'))
                        if basis == 'documented' and not (
                                {'doc', 'commit', 'issue'} & set(kinds)):
                            raw.append((row_ln, 'E610',
                                        'basis documented requires a doc, '
                                        'commit, or issue citation'))
                        if basis == 'inferred' and not [
                                k for k in kinds if k != 'searched']:
                            raw.append((row_ln, 'E610',
                                        'basis inferred requires a '
                                        'non-searched citation'))
                        if (tol == 'undetermined') != (basis == 'unknown'):
                            raw.append((row_ln, 'E611',
                                        'tolerance undetermined if and only '
                                        'if basis unknown'))

    errors = [(path, ln, code, msg) for ln, code, msg in raw]
    return errors, own_id, refs


def collect_files(args):
    """Expand each argument into LLD.md file paths. Returns (files, bad_arg)."""
    files = []
    for arg in args:
        if os.path.isdir(arg):
            for root, dirs, names in os.walk(arg):
                dirs.sort()
                if 'LLD.md' in names:
                    files.append(os.path.join(root, 'LLD.md'))
        elif os.path.isfile(arg):
            files.append(arg)
        else:
            return files, arg
    unique = []
    seen = set()
    for path in files:
        if path not in seen:
            seen.add(path)
            unique.append(path)
    return unique, None


def check_register(per_file):
    """Register-wide checks E109, E408, E409 across the validated set.

    per_file: list of (path, own_id, id_line, refs). Returns error tuples.
    """
    errors = []
    seen_ids = {}
    for path, own_id, id_line, refs in per_file:
        if own_id is None:
            continue
        if own_id in seen_ids:
            errors.append((path, id_line, 'E109',
                           'duplicate id %s across the validated set '
                           '(first in %s)' % (own_id, seen_ids[own_id])))
        else:
            seen_ids[own_id] = path
    # E408: every ref resolves to a drawing in the validated set.
    graph = {}
    for path, own_id, id_line, refs in per_file:
        if own_id is not None:
            graph.setdefault(own_id, set())
        for ref, line in refs:
            if ref not in seen_ids:
                errors.append((path, line, 'E408',
                               'ref %s does not resolve to a drawing in '
                               'the validated set' % ref))
            elif own_id is not None:
                graph[own_id].add(ref)
    # E409: ref edges contain no cycle.
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {node: WHITE for node in graph}
    cyclic = set()

    def visit(node, stack):
        color[node] = GRAY
        for nxt in sorted(graph.get(node, ())):
            if nxt not in color:
                continue
            if color[nxt] == GRAY:
                cyclic.update(stack + [nxt])
            elif color[nxt] == WHITE:
                visit(nxt, stack + [nxt])
        color[node] = BLACK

    for node in sorted(graph):
        if color[node] == WHITE:
            visit(node, [node])
    for path, own_id, id_line, refs in per_file:
        if own_id in cyclic:
            errors.append((path, id_line, 'E409',
                           'ref edges form a cycle through %s' % own_id))
    return errors


def main(argv):
    if len(argv) < 2:
        print(USAGE, file=sys.stderr)
        return 2
    files, bad_arg = collect_files(argv[1:])
    if bad_arg is not None:
        print('error: no such file or directory: ' + bad_arg, file=sys.stderr)
        return 2
    errors = []
    per_file = []
    for path in files:
        try:
            with open(path, encoding='utf-8-sig') as fh:
                text = fh.read()
        except OSError as exc:
            print('error: cannot read %s: %s' % (path, exc), file=sys.stderr)
            return 2
        file_errors, own_id, refs = validate_file(path, text)
        errors.extend(file_errors)
        entries, _, _ = parse_front_matter(text.splitlines())
        item = entries.get('id')
        id_line = item[1] if item is not None else 1
        per_file.append((path, own_id, id_line, refs))
    errors.extend(check_register(per_file))
    errors.sort(key=lambda e: (e[0], e[1], e[2]))
    for path, line, code, message in errors:
        print('%s:%d: %s %s' % (path, line, code, message))
    if errors:
        return 1
    print('OK: %d file(s), 0 errors' % len(files))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
