export const makeAutoObservable = <T,>(target: T): T => target;
export const runInAction = <T,>(action: () => T): T => action();
