const tape = require('tape')

tape('SUMMARY', function (t) {
    // this is a dummy test to help closing node handles.
    // instead check process to close with https://github.com/Raynos/leaked-handles ?
    t.end()
    process.exit(0)

})