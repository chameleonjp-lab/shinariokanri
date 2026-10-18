import {runHistoryMeasurement} from './history-measurement-core';
declare global {interface Window {historyMeasurement:{run:typeof runHistoryMeasurement};historyMeasurementCheckpoint?:(value:unknown)=>Promise<void>}}
window.historyMeasurement={run:options=>runHistoryMeasurement(options,value=>window.historyMeasurementCheckpoint?.(value)??Promise.resolve())};
