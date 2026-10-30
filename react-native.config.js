// The x86 hand tracker test builds without llama.rn, which ships no 32 bit
// libraries (see .github/workflows/android-tracker-test.yml). Every other
// build links it.
module.exports = {
  dependencies:
    process.env.SIGIL_WITHOUT_LLAMA === '1' ? { 'llama.rn': { platforms: { android: null, ios: null } } } : {},
};
