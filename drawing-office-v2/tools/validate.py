"""Conformance validator for drawing-office LLD.md files.

Enforces the machine-checked rules in STANDARD.md. Stdlib only.

Usage: python tools/validate.py <path> [<path>...]
Each path is a directory (recursively globbed for LLD.md) or a file.
Errors go to stdout as `path:line: E### message`, sorted by (path, line).
Exit 1 if any errors, 0 if clean, 2 on usage problems.
"""

import os
import re
import sys

USAGE = 'usage: python tools/validate.py <path> [<path>...]'

CANONICAL_KEYS = [
    'id', 'title', 'revision', 'status', 'author',
    'reviewed_by', 'date', 'part_count', 'supersedes',
]

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

# The complete rejection set for tolerance cells: empty, hyphen, em dash, en dash.
DASH_CELLS = {'', '-', '—', '–'}

STATUSES = {'draft', 'released', 'superseded'}

# v2: every tolerance declares its KIND. Non-behavioral kinds require an
# inspection op whose tooling can actually OBSERVE that class of violation --
# a behavior test cannot see an O(n)-vs-O(1) regression, a missing fault seam,
# or a concurrency race. This is the anti-toothless mechanism (E610).
KIND_ENUM = {'behavioral', 'complexity', 'timing',
             'resource', 'concurrency', 'fault'}
KIND_TOOLING = {
    'complexity':  ('measure', 'timing', 'benchmark', 'counter',
                    'profil', 'latency', 'clock'),
    'timing':      ('measure', 'timing', 'benchmark', 'latency',
                    'clock', 'stopwatch'),
    'resource':    ('measure', 'counter', 'profil', 'memory', 'benchmark'),
    'concurrency': ('race', 'concurrent', 'interleav', 'thread',
                    'goroutine', 'parallel'),
    'fault':       ('fault', 'inject', 'failure', 'crash', 'kill'),
}


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
    for first occurrences of canonical keys. close_line is the 1-based line
    of the closing --- or None. errors is a list of (line, code, message).
    """
    errors = []
    entries = {}
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
        if key not in CANONICAL_KEYS:
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


def validate_file(path, text):
    """Validate one LLD file. Returns a list of (path, line, code, message)."""
    lines = text.splitlines()
    raw = []

    entries, close_line, fm_errors = parse_front_matter(lines)
    raw.extend(fm_errors)

    part_count = None
    part_count_line = None
    if close_line is not None:
        raw.extend(check_front_matter_values(entries))
        item = entries.get('part_count')
        if item and INT_RE.fullmatch(item[0]) and int(item[0]) > 0:
            part_count = int(item[0])
            part_count_line = item[1]

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

    # --- BILL OF MATERIALS (E401-E404) ---
    bom_rows = []          # (part, line) per data row, in order
    bom_part_set = set()
    bom_present = False
    span = section_span('## BILL OF MATERIALS')
    if span is not None:
        head, end = span
        tables = find_tables(lines, fenced, head + 1, end)
        if not tables:
            raw.append((head, 'E401', 'no table in BILL OF MATERIALS'))
        else:
            bom_present = True
            table = tables[0]
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
            if part_count is not None and part_count != len(table['data']):
                raw.append((part_count_line, 'E404',
                            'part_count %d does not equal BOM data-row '
                            'count %d' % (part_count, len(table['data']))))

    # --- DETAIL DRAWINGS (E501-E503) ---
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
            has_commodity = any('commodity part' in lines[j].lower()
                                for j in range(ln, body_end))
            if not has_mermaid and not has_commodity:
                raw.append((ln, 'E502',
                            'detail entry has neither a mermaid fence nor '
                            'a commodity note'))
        if bom_present:
            for part, row_ln in bom_rows:
                if part not in detail_parts:
                    raw.append((row_ln, 'E501',
                                'BOM part has no detail heading: ' + part))

    # --- PROCESS PLAN op -> tooling map (for E606 / E610 cross-checks) ---
    process_tooling = {}   # op-number str -> lowercased tooling cell
    span_pp = section_span('## PROCESS PLAN')
    if span_pp is not None:
        head_pp, end_pp = span_pp
        pp_tables = find_tables(lines, fenced, head_pp + 1, end_pp)
        if pp_tables:
            for row_ln in pp_tables[0]['data']:
                cells = parse_cells(lines[row_ln - 1])
                if cells and INT_RE.fullmatch(cells[0]):
                    tooling = cells[2].lower() if len(cells) > 2 else ''
                    process_tooling[cells[0]] = tooling

    # --- CONTRACTS & TOLERANCES (v2: E601-E610) ---
    op_ref_re = re.compile(r'Op\s+([0-9]+)')
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
            ret_idx = idx.get('return shape')
            kind_idx = idx.get('kind')
            op_idx = idx.get('inspection op')
            if tol_idx is None:
                raw.append((table['header'], 'E602',
                            'contract table has no Tolerance column'))
                continue
            if ret_idx is None:
                raw.append((table['header'], 'E607',
                            'contract table has no "Return shape" column'))
            if kind_idx is None:
                raw.append((table['header'], 'E608',
                            'contract table has no "Kind" column'))
            if op_idx is None:
                raw.append((table['header'], 'E604',
                            'contract table has no "Inspection op" column'))

            def cell_at(cells, i):
                return cells[i] if (i is not None and i < len(cells)) else ''

            for row_ln in table['data']:
                cells = parse_cells(lines[row_ln - 1])

                # E603: tolerance present
                if cell_at(cells, tol_idx) in DASH_CELLS:
                    raw.append((row_ln, 'E603',
                                'tolerance cell empty or dash-only'))
                # E607: return shape present (closes the return-shape gap)
                if ret_idx is not None and cell_at(cells, ret_idx) in DASH_CELLS:
                    raw.append((row_ln, 'E607',
                                'return-shape cell empty or dash-only'))
                # E608: kind present and valid
                kind = cell_at(cells, kind_idx).lower()
                if kind_idx is not None:
                    if kind in DASH_CELLS:
                        raw.append((row_ln, 'E608',
                                    'kind cell empty or dash-only'))
                    elif kind not in KIND_ENUM:
                        raw.append((row_ln, 'E608',
                                    'kind not one of '
                                    + '|'.join(sorted(KIND_ENUM))
                                    + ': ' + repr(kind)))
                # E605 / E606: inspection-op coverage
                refs = []
                if op_idx is not None:
                    op_cell = cell_at(cells, op_idx)
                    if op_cell in DASH_CELLS:
                        raw.append((row_ln, 'E605',
                                    'tolerance has no inspection op '
                                    '(coverage gap)'))
                    else:
                        refs = op_ref_re.findall(op_cell)
                        if not refs:
                            raw.append((row_ln, 'E605',
                                        'inspection-op cell has no Op NN '
                                        'reference: ' + repr(op_cell)))
                        for num in refs:
                            if num not in process_tooling:
                                raw.append((row_ln, 'E606',
                                            'inspection op Op %s not in '
                                            'Process Plan' % num))
                # E610: anti-toothless. A non-behavioral tolerance must cite an
                # op whose tooling can OBSERVE that class of violation.
                if kind in KIND_TOOLING and refs:
                    needed = KIND_TOOLING[kind]
                    ok = any(any(kw in process_tooling.get(num, '')
                                 for kw in needed)
                             for num in refs)
                    if not ok:
                        raw.append((row_ln, 'E610',
                                    'kind=%s but no cited op uses %s tooling '
                                    '(toothless: a behavior test cannot '
                                    'observe this violation)'
                                    % (kind, '/'.join(needed))))

    return [(path, ln, code, msg) for ln, code, msg in raw]


def extract_id(text):
    """Return (id_value, line) from the front matter, or None."""
    entries, _, _ = parse_front_matter(text.splitlines())
    item = entries.get('id')
    if item is not None and item[0] != '':
        return item
    return None


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


def main(argv):
    if len(argv) < 2:
        print(USAGE, file=sys.stderr)
        return 2
    files, bad_arg = collect_files(argv[1:])
    if bad_arg is not None:
        print('error: no such file or directory: ' + bad_arg, file=sys.stderr)
        return 2
    errors = []
    seen_ids = {}
    for path in files:
        try:
            with open(path, encoding='utf-8-sig') as fh:
                text = fh.read()
        except OSError as exc:
            print('error: cannot read %s: %s' % (path, exc), file=sys.stderr)
            return 2
        errors.extend(validate_file(path, text))
        found = extract_id(text)
        if found is not None:
            value, line = found
            if value in seen_ids:
                errors.append((path, line, 'E109',
                               'duplicate id %s across the validated set '
                               '(first in %s)' % (value, seen_ids[value])))
            else:
                seen_ids[value] = path
    errors.sort(key=lambda e: (e[0], e[1], e[2]))
    for path, line, code, message in errors:
        print('%s:%d: %s %s' % (path, line, code, message))
    if errors:
        return 1
    print('OK: %d file(s), 0 errors' % len(files))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
