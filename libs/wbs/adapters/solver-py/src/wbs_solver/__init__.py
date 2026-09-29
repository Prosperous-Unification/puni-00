"""The `wbs-solver` package: CP-SAT placement behind one stdin/stdout solve.

`__version__` is the single source of this distribution's version. setuptools
reads it from here (pyproject.toml `[tool.setuptools.dynamic]`), so the running
interpreter and the installed metadata cannot drift apart, and the coordinator
reads the installed metadata as the `solverVersion` half of `contractVersion`.

It is `0.2.0` because it speaks solver wire 3, which carries each person's
bookings elsewhere as fixed intervals (`share-people-across-projects` slice 5),
and refuses wire 2; 0.1.4 refuses wire 3 at the schema's `wireVersion` const.
Before that, `0.1.4` marked the FF start weights and integer-infeasibility
outcomes that changed after 0.1.3.
The golden request corpus spends the new string.
See pyproject.toml's header for the full argument; `tests/test_version.py`
asserts the pin against the corpus rather than restating it.

Nothing else is exported. The package has no application import surface on
purpose: solving enters through `wbs-solver` (or `python -m wbs_solver`), while
production first enters through the lightweight `wbs-solver-launcher` bind
gate from the same version-locked distribution.
"""

# Proof: at 0.1.3 the mounted cache regression read an old integer-infeasibility
# certificate under the current fixture key (expected miss, received certificate).
__version__ = "0.2.0"

__all__ = ["__version__"]
