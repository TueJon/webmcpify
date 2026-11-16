// Compile-only contract fixture; never run in a browser.
const outputContractTool: ModelContextTool = {
  name: 'read_fixture',
  description: 'Reads a synthetic fixture label.',
  outputSchema: { type: 'object', properties: { label: { type: 'string' } } },
  execute: async () => ({ label: 'fixture' }),
};
void outputContractTool;
const invalidOutputContract: ModelContextTool = {
  name: 'invalid_fixture',
  description: 'Invalid compile-only contract.',
  // @ts-expect-error registration accepts an object schema, never a serialized string
  outputSchema: '{"type":"object"}',
  execute: async () => ({ label: 'fixture' }),
};
void invalidOutputContract;
function readOutputContract(tool: RegisteredTool): object | string | undefined {
  return tool.outputSchema;
}
void readOutputContract;
