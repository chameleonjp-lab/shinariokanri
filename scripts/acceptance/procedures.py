"""Canonical formal commands and independent reconstruction of portable originals."""
import json
from pathlib import PurePosixPath

from check_phase3 import require


def absolute(path):
    require(isinstance(path, str) and path.startswith('/') and
            str(PurePosixPath(path)) == path and '..' not in PurePosixPath(path).parts,
            'Noncanonical recorded absolute path')
    return path


def canonical_command(step, proof):
    proof = absolute(proof)
    raw = proof+'/'+step+'/raw.json'
    if step in ('performance-standard', 'performance-large'):
        return ['node', 'scripts/measure-app.mjs', '--size', step.removeprefix('performance-'),
                '--samples', '30', '--mode', 'performance', '--output', raw]
    if step == 'saves180':
        return ['node', 'scripts/acceptance/measure-original-saves.mjs', '--binding', proof+'/candidate.json',
                '--proof', proof, '--attempt', 'saves180']
    if step == 'soak':
        return ['node', 'scripts/measure-large-history.mjs', '--soak-seconds', '7200',
                '--restore-storage', 'persistent', '--output', raw]
    require(step == 'exceptions', 'Unknown formal step')
    return ['node', 'scripts/acceptance/measure-full-exceptions.mjs', '--binding', proof+'/candidate.json',
            '--source', proof+'/soak', '--output', raw]


def portable_driver(step, snapshot, repo, proof, commit):
    absolute(repo); absolute(proof)
    if step not in ('saves180', 'exceptions'): return None
    quote = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    if step == 'saves180':
        text = snapshot['scripts/acceptance/originals/six-save-forms.mjs'].decode()
        substitutions = [
            ("const source='/workspace/pr49-graph-measure-source',proof='/workspace/pr49-benchmark';",
             f'const source={quote(repo)},proof={quote(proof)};'),
            ("const bindingPath='/workspace/pr49-benchmark/candidate-1fcadcca-binding.json';",
             f'const bindingPath={quote(proof+"/candidate.json")};'),
            ("const artifactRoot='/workspace/pr49-checks/candidate-1fcadcca/dist',base=binding.build_info.base;",
             "const artifactRoot=resolve(source,'dist'),base=binding.build_info.base;"),
            ("candidate:'PR49-1fcadcca'", "candidate:'phase3-final-candidate'"),
            ("server.listen(5351,'127.0.0.1',ok));const origin='http://127.0.0.1:5351',url=origin+base;",
             "server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+server.address().port,url=origin+base;")]
    else:
        text = snapshot['scripts/acceptance/originals/full-large-exceptions.mjs'].decode()
        substitutions = [
            ("const repo = '/workspace/pr49-graph-measure-source';", f'const repo = {quote(repo)};'),
            ("const root = '/workspace/pr49-checks/soak7200-1fcadcca-attempt1';", f'const root = {quote(proof+"/soak")};'),
            ("git('rev-parse', 'HEAD') === '1fcadcca703863873a57d297e83b1b184e63e778'",
             f"git('rev-parse', 'HEAD') === {quote(commit)}")]
    for old, new in substitutions:
        require(text.count(old) == 1, 'Ambiguous authorized portability substitution')
        text = text.replace(old, new)
    return text.encode()


def verify_execution(step, command, sequence_argv, repo, proof, commit, snapshot, retained_driver):
    require(command['cwd'] == absolute(repo) and command['argv'] == sequence_argv == canonical_command(step, proof),
            'Executed command/cwd differs from the canonical original procedure')
    require(retained_driver == portable_driver(step, snapshot, repo, proof, commit),
            'Executed driver differs from sealed original and authorized substitutions')
