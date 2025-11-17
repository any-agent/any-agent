# Simple Agent Examples

This file contains example prompts and use cases for the simple agent.

## Quick Start with LM Studio

1. **Install LM Studio**: Download from [lmstudio.ai](https://lmstudio.ai/)
2. **Download a Model**: Choose a model with tool calling support (e.g., Llama 3.1 8B)
3. **Start the Server**: Go to "Local Server" tab and click "Start Server"
4. **Configure**:
   ```bash
   AI_PROVIDER=openai-compatible
   OPENAI_BASE_URL=http://localhost:1234/v1
   AI_MODEL=your-model-name
   ```
5. **Run**: `bun run src/index.ts "Your prompt"`

## Code Execution Examples

### Python

```bash
# Calculate Fibonacci numbers
bun run src/index.ts "Write a Python script that calculates the first 10 Fibonacci numbers and execute it"

# Data processing
bun run src/index.ts "Create a Python script that reads a list of numbers, sorts them, and prints the median"

# File generation
bun run src/index.ts "Write a Python script that creates a CSV file with random data (10 rows, 3 columns)"
```

### Node.js / Bun

```bash
# JSON processing
bun run src/index.ts "Write a Node.js script that creates a JSON object with user data and saves it to a file"

# String manipulation
bun run src/index.ts "Create a Bun script that counts word frequency in a text string"
```

### Bash

```bash
# System operations
bun run src/index.ts "Write a bash script that creates a directory structure for a new project"

# Text processing
bun run src/index.ts "Create a bash script that counts lines in a text file"
```

## Multi-Step Examples

```bash
# Complex calculation
bun run src/index.ts "Calculate the sum of squares of all even numbers between 1 and 100 using Python"

# Data analysis
bun run src/index.ts "Generate 100 random numbers in Python, calculate their mean and standard deviation"

# Algorithm implementation
bun run src/index.ts "Implement quicksort in Python and test it with a random list of 20 numbers"
```

## Programmatic Usage

### Basic Usage

```typescript
import { runAgent } from "./src/index.js";

// Run with Anthropic
await runAgent("Your prompt here", {
  provider: "anthropic",
  model: "claude-3-5-sonnet-20241022",
  supervisorUrl: "http://localhost:8080",
});
```

### Custom System Prompt

```typescript
import { runAgent } from "./src/index.js";

await runAgent("Calculate factorial of 10", {
  provider: "anthropic",
  model: "claude-3-5-sonnet-20241022",
  supervisorUrl: "http://localhost:8080",
  systemPrompt: "You are a math tutor. Explain your code step by step.",
});
```

### Using OpenAI

```typescript
import { runAgent } from "./src/index.js";

await runAgent("Write hello world in Python", {
  provider: "openai",
  model: "gpt-4o",
  supervisorUrl: "http://localhost:8080",
});
```

### Using LM Studio (Local Models)

```typescript
import { runAgent } from "./src/index.js";

await runAgent("Calculate factorial of 5", {
  provider: "openai-compatible",
  model: "llama-3.1-8b-instruct",
  baseURL: "http://localhost:1234/v1",
  apiKey: "not-needed",
  supervisorUrl: "http://localhost:8080",
});
```

### Using Ollama

```typescript
import { runAgent } from "./src/index.js";

await runAgent("Sort these numbers: 5, 2, 8, 1, 9", {
  provider: "openai-compatible",
  model: "llama3.2",
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
  supervisorUrl: "http://localhost:8080",
});
```

## Document Conversion Examples

Note: Document conversion requires base64-encoded file content. These examples show the general idea:

```bash
# PDF to Markdown (would need actual base64 content)
bun run src/index.ts "Convert the attached PDF to Markdown format"

# HTML to Markdown
bun run src/index.ts "Convert this HTML document to Markdown"
```

## Tips

1. **Be specific**: The more specific your prompt, the better the results
2. **Iterate**: If the first result isn't perfect, ask for modifications
3. **Check outputs**: The agent will return artifacts for any files created
4. **Error handling**: The agent will show exit codes and error messages
5. **Supervisor required**: Make sure the tools supervisor is running first

## Running the Supervisor

Before running these examples, ensure the tools supervisor is running:

```bash
cd ../tools/supervisor
bun run start
```

The supervisor should be accessible at `http://localhost:8080`.
