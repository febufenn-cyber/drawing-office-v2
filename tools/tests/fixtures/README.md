# Validator fixtures

Each directory is one scenario: LLD.md file(s) plus expected.txt listing
the error codes `tools/validate.py` must emit for that directory, one per
line, with multiplicity; an empty expected.txt means the fixture must
validate clean. Fixtures fail on purpose — never move them under designs/.
Run the suite with `python tools/tests/run.py`.
