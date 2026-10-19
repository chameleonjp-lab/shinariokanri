"""New reconstruction of 11 original-condition rejection cases, not release evidence."""
import base64
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('supplements', ROOT/'scripts/acceptance/verify_supplements.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


def zip_project(project):
    data = json.dumps(project).encode()
    manifest = {'files':[{'path':'data/project.json','byteSize':len(data),'sha256':v.sha(data)}]}
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as archive:
        archive.writestr('data/project.json', data)
        archive.writestr('manifest.json', json.dumps(manifest))
    return out.getvalue()


class Evidence:
    def __init__(self):
        self.data = {}
    def raw(self, name):
        v.require(name in self.data, 'missing test attachment')
        return self.data[name]
    def json(self, name):
        return json.loads(self.raw(name))
    def set(self, name, value):
        self.data[name] = json.dumps(value).encode()
    def backup(self, ordinal, project):
        raw = zip_project(project)
        name = f'complete-backup-{ordinal:03d}.scenario'
        self.data[name] = raw
        self.set(name+'.json', dict(sequence=ordinal,fileName=name,fileBytes=len(raw),fileSHA256=v.sha(raw)))
        return raw


def rg23():
    out = {}
    for changes in (False, True):
        for route in ('skip','via','initial'):
            title = f'RG-R02 exact original fixture changes={str(changes).lower()} route={route}'
            e = Evidence()
            given = {'projectId':'given','entities':[],'history':[]}
            raw = zip_project(given)
            e.data['RG-R02-given.scenario'] = raw
            e.set('RG-R02-given.json', dict(fixtureBytes=len(raw),fixtureSha256=v.sha(raw),facts=dict(changesCondition=changes,route=route)))
            state = dict(assertions=[],callStack=[],contentVersionId='version',itemInstances=[],loopNumber=0,onceTriggers=[],presentationPosition='end',provenance='full_play',rngPosition=0,rngSeed='物語の試読',seenIds=['entry','end'],variableValues={'can_reveal':{'type':'boolean','value':not changes}},visitCounts={'entry':1,'end':1})
            trace = {'id':'trace','kind':'trace','data':dict(contentVersionId='version',steps=[dict(before={**state,'presentationPosition':'entry'},after=state,presentationState=state,conditionResults=[dict(value='true')])])}
            raw = e.backup(1, {'entities':[trace]})
            e.set('RG-R02-actual.json', dict(changes=changes,route=route,traceId='trace',sourceVersionId='version',finalState=state,findings=[] if route=='via' else [{'code':'REQUIRED_INFO_MISSING'}],actualCompleteSHA256=v.sha(raw)))
            e.set('actual-product.json',dict(build={'version':'build'},buildInfoSHA256='buildhash'))
            out[title] = e
    for policy in ('manual_choice','first_match','all_match'):
        for mixed in (False,True):
            title = f'RG-R03 exact original fixture policy={policy} mixed={str(mixed).lower()}'
            e = Evidence()
            given = {'entities':[dict(id='entry',data={'executionPolicy':policy,'effectIds':['valid','rejected'] if mixed else ['rejected']})], 'history':[]}
            raw = zip_project(given)
            e.data['RG-R03-given.scenario'] = raw
            e.set('RG-R03-given.json',dict(fixtureBytes=len(raw),fixtureSha256=v.sha(raw),facts=dict(policy=policy,mixed=mixed)))
            e.backup(1,given)
            raw = e.backup(2,given)
            e.set('RG-R03-actual.json',dict(policy=policy,mixed=mixed,error='REFERENCE_INVALID · 不採用',beforeVisible='unchanged',afterVisible='unchanged',beforeHeading='entry',afterHeading='entry',authorNativeUnchanged=True,failedOperationNotAddedToHistory=True,actualCompleteSHA256=v.sha(raw)))
            e.set('actual-product.json',dict(build={'version':'build'},buildInfoSHA256='buildhash'))
            out[title] = e
    return out


def n05():
    tables = {name:dict(count=0,sha256='0'*64) for name in v.NATIVE_TABLES}
    tables['entities']['count']=88522
    tables['assets']['count']=3
    tables['workspaceInputs']['count']=1
    result = dict(status='unknown',truncated=True,limits=dict(maxStates=100000,maxTransitions=10000,maxMs=30000),declaredEntryIds=['unbounded','long'])
    return dict(fixture={'retainedOriginalRecords':88003},result=result,nativeBefore=tables,nativeAfter=copy.deepcopy(tables),timing=dict(startedAt=100,firstPaintAt=500,largestTimerGap=100),progress='状態を確認中 10件')


class SupplementRejects(unittest.TestCase):
    def setUp(self):
        self.detail = n05()
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        (self.directory/'downloads').mkdir()
        self.provenance = dict(trial='trial',candidate='candidate',build={'version':'build'})
        self.events = []
        for i in (1,2):
            raw = json.dumps(self.detail['result']).encode()
            path = f'downloads/{i}.json'
            (self.directory/path).write_bytes(raw)
            self.events.append(dict(**self.provenance,event=i,path=path,savedPath=str(self.directory/path),bytes=len(raw),sha256=v.sha(raw),completed=True,filename='result.json',url='blob:real-event'))
    def tearDown(self):
        self.temporary.cleanup()
    def downloads(self):
        return v.download_payloads(self.directory,self.events,self.provenance)
    def test_valid_equal_bytes_from_two_distinct_events(self):
        v.assess_n05(self.detail,self.downloads(),self.detail['fixture'])
    def test_01_n05_one_missing_event(self):
        self.events.pop()
        with self.assertRaisesRegex(ValueError,'missing/sequenced'):
            self.downloads()
    def test_02_n05_json_copy_has_no_second_event(self):
        self.events[1] = copy.deepcopy(self.events[0])
        with self.assertRaisesRegex(ValueError,'missing/sequenced'):
            self.downloads()
    def test_03_n05_other_trial(self):
        self.events[1]['trial']='other'
        with self.assertRaisesRegex(ValueError,'mixed event'):
            self.downloads()
    def test_04_n05_other_build(self):
        self.events[1]['build']={'version':'other'}
        with self.assertRaisesRegex(ValueError,'mixed event'):
            self.downloads()
    def test_05_n05_count_only_native_match(self):
        self.detail['nativeAfter']['commands']['sha256']='1'*64
        with self.assertRaisesRegex(ValueError,'29 native'):
            v.assess_n05(self.detail,self.downloads(),self.detail['fixture'])
    def test_06_rg01_eight_duplicate_checkpoints(self):
        e=Evidence();e.set('supplemental-original-RG01-summary.json',{'procedures':[{'label':v.CHECKPOINTS[0]}]*8})
        with self.assertRaisesRegex(ValueError,'eight checkpoint'):
            v.assess_rg01(e,{})
    def test_07_rg01_checkpoint_replacement(self):
        e=Evidence();labels=list(v.CHECKPOINTS);labels[3]='other-operation'
        e.set('supplemental-original-RG01-summary.json',{'procedures':[{'label':label} for label in labels]})
        with self.assertRaisesRegex(ValueError,'eight checkpoint'):
            v.assess_rg01(e,{})
    def test_valid_rg02_rg03_all_original_conditions(self):
        original=rg23()
        v.assess_rg23(copy.deepcopy(original),original,{'version':'build'},'buildhash')
    def test_08_rg02_six_count_replaces_condition(self):
        original=rg23();current=copy.deepcopy(original)
        title=next(iter(current));current[title+' substituted']=current.pop(title)
        with self.assertRaisesRegex(ValueError,'six plus six'):
            v.assess_rg23(current,original,{'version':'build'},'buildhash')
    def test_09_rg02_full_trace_state_substitution(self):
        original=rg23();current=copy.deepcopy(original);e=current[next(iter(current))]
        raw,project=v.complete(e,1)
        project['entities'][0]['data']['steps'][0]['before']['rngPosition']=1
        raw=e.backup(1,project)
        actual=e.json('RG-R02-actual.json');actual['actualCompleteSHA256']=v.sha(raw);e.set('RG-R02-actual.json',actual)
        with self.assertRaisesRegex(ValueError,'full trace'):
            v.assess_rg23(current,original,{'version':'build'},'buildhash')
    def test_10_rg03_mixed_given_substitution(self):
        original=rg23();current=copy.deepcopy(original)
        title=next(t for t in current if 'policy=all_match mixed=true' in t)
        e=current[title];given,_=v.scenario(e.raw('RG-R03-given.scenario'));given['entities'][0]['data']['effectIds']=['rejected']
        raw=zip_project(given);e.data['RG-R03-given.scenario']=raw
        facts=e.json('RG-R03-given.json');facts.update(fixtureBytes=len(raw),fixtureSha256=v.sha(raw));e.set('RG-R03-given.json',facts)
        with self.assertRaisesRegex(ValueError,'given values'):
            v.assess_rg23(current,original,{'version':'build'},'buildhash')
    def test_11_rg_other_build_despite_passed_report(self):
        original=rg23();current=copy.deepcopy(original)
        e=current[next(iter(current))];e.set('actual-product.json',dict(build={'version':'other'},buildInfoSHA256='buildhash'))
        with self.assertRaisesRegex(ValueError,'actual build'):
            v.assess_rg23(current,original,{'version':'build'},'buildhash')
    def test_n05_outer_step_requires_real_driver_argv_hash_and_exit(self):
        driver=ROOT/'scripts/acceptance/capture_n05_downloads.mjs'
        binding=self.directory/'binding.json'
        argv=['node',str(driver),'--repository',str(ROOT),'--binding',str(binding),'--output',str(self.directory/'n05')]
        valid=dict(step='n05',argv=argv,status='passed',returncode=0,originalSHA256=v.ORIGINAL_N05_SHA256,driverSHA256=v.sha(driver.read_bytes()))
        for key,value,message in [('argv',['node','other'],'argv/exit'),('returncode',1,'argv/exit'),('driverSHA256','0'*64,'driver/source')]:
            with self.subTest(key=key):
                row=copy.deepcopy(valid);row[key]=value
                with self.assertRaisesRegex(ValueError,message):
                    v.verify_n05_step(ROOT,binding,self.directory,row)
    def test_failed_real_exit_rejects_even_with_success_artifacts(self):
        directory=self.directory/'execution';directory.mkdir()
        wrapper=(ROOT/'scripts/acceptance/execute.py').read_bytes()
        (directory/'executed-wrapper.py').write_bytes(wrapper)
        command=dict(argv=['true'],cwd=str(ROOT),childPid=123,startedAt='2026-10-19T00:00:00',procedure=dict(path=str(ROOT/'scripts/acceptance/execute.py'),retained='executed-wrapper.py',bytes=len(wrapper),sha256=v.sha(wrapper)))
        (directory/'command.json').write_text(json.dumps(command))
        (directory/'exit.json').write_text(json.dumps(dict(returncode=1,executedWrapperBytesUnchanged=True,childPid=123)))
        with self.assertRaisesRegex(ValueError,'real child exit'):
            v.receipt(ROOT,directory,['true'])
    def test_only_documented_path_and_identity_transform(self):
        raw='a /workspace/pr49-measure-source b 1fcadcca703863873a57d297e83b1b184e63e778 8ec3a03810bb0cf1b1b4'
        binding={'commit':'candidate','build_info':{'version':'version'}}
        self.assertEqual(v.transform(raw,'/repo',binding,'/out',identity=True),'a /repo b candidate version')
        self.assertNotEqual(v.transform(raw,'/repo',binding,'/out'),raw.replace('a ','other '))


if __name__ == '__main__':
    unittest.main()
