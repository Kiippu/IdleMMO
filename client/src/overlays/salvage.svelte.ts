// done counts finished salvages so a list can leave select mode after one (Cancel does not bump it).
export const salvageReq = $state<{ uids: string[] | null; label: string; done: number }>({ uids: null, label: '', done: 0 });
export const openSalvage = (uids: string[], label = '') => { salvageReq.uids = uids; salvageReq.label = label; };
export const closeSalvage = () => { salvageReq.uids = null; };
