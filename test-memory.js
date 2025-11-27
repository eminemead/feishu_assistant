process.env.OPENAI_API_KEY = "test-key";
const { memoryProvider } = require('./dist/lib/memory.js');
console.log('memoryProvider type:', memoryProvider.constructor.name);
console.log('memoryProvider methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(memoryProvider)));
