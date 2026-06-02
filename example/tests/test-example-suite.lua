luaunit = require('../libs/luaunit')

-- Suite-style tests: setUp/tearDown run before/after each test method.
-- Run a whole suite: lua test-example-suite.lua TestCounter
-- Run one method:   lua test-example-suite.lua TestCounter.testIncrement

TestCounter = {}

function TestCounter:setUp()
    self.counter = 0
end

function TestCounter:tearDown()
    self.counter = nil
end

function TestCounter:testIncrement()
    self.counter = self.counter + 1
    luaunit.assertEquals(self.counter, 1)
end

function TestCounter:testStartsAtZero()
    luaunit.assertEquals(self.counter, 0)
end

function TestCounter:testFailed()
    luaunit.assertEquals(self.counter, 99)
end

TestGreeter = {}

function TestGreeter:setUp()
    self.name = "World"
end

function TestGreeter:testGreeting()
    luaunit.assertEquals("Hello " .. self.name, "Hello World")
end

function TestGreeter:testName()
    luaunit.assertNotNil(self.name)
end

os.exit(luaunit.LuaUnit.run())
