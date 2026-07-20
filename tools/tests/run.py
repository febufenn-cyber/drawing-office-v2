"""Self-test runner for tools/validate.py.

Each directory under fixtures/ holds one scenario: LLD.md file(s) plus an
expected.txt listing the error codes the validator must emit for that
directory, one code per line, with multiplicity; an empty expected.txt
means the fixture must validate clean. Stdlib only.

Usage: python tools/tests/run.py
Exit 0 when every fixture produces exactly its expected codes, 1 otherwise.
"""

import os
import re
import subprocess
import sys

CODE_RE = re.compile(r' (E[0-9]{3}) ')


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    fixtures = os.path.join(base, 'fixtures')
    validate = os.path.join(base, os.pardir, 'validate.py')
    failures = 0
    names = sorted(
        n for n in os.listdir(fixtures)
        if os.path.isdir(os.path.join(fixtures, n)))
    for name in names:
        d = os.path.join(fixtures, name)
        with open(os.path.join(d, 'expected.txt'), encoding='utf-8') as fh:
            expected = sorted(tok for tok in fh.read().split() if tok)
        proc = subprocess.run(
            [sys.executable, validate, d], capture_output=True, text=True)
        got = sorted(
            m for line in proc.stdout.splitlines()
            for m in CODE_RE.findall(line))
        ok = got == expected
        exit_ok = (proc.returncode == 0) == (not expected)
        if ok and exit_ok:
            print('PASS %s (%s)' % (name, ' '.join(expected) or 'clean'))
        else:
            failures += 1
            print('FAIL %s: expected [%s] got [%s] exit=%d'
                  % (name, ' '.join(expected), ' '.join(got),
                     proc.returncode))
    print('%d fixture(s), %d failure(s)' % (len(names), failures))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
