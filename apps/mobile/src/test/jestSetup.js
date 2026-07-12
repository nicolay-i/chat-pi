global.IS_REACT_ACT_ENVIRONMENT = true;

const { resetTestRootStore } = require('./rootStoreHarness');

globalThis.afterEach(() => {
  resetTestRootStore();
});
