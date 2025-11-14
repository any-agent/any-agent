import { describe, test, expect } from "bun:test";
import { RunResponseSchema } from "../../src/core/schemas";
import { getJobWorkDir } from "../../src/core/storage";
import path from "path";

const ENDPOINT = process.env.INTEGRATION_TEST_ENDPOINT || "http://localhost:8080";

function getSessionId(): string {
	return `int-test-${Date.now()}`;
}

async function executeCode(params: {
	sessionId: string;
	language: string;
	code: string;
	filename: string;
}) {
	const response = await fetch(`${ENDPOINT}/run`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});

	expect(response.ok).toBe(true);
	const data = await response.json();

	// Validate response schema
	const validated = RunResponseSchema.parse(data);
	return validated;
}

async function downloadArtifact(url: string): Promise<string> {
	const response = await fetch(url);
	expect(response.ok).toBe(true);
	return await response.text();
}

async function readArtifactDirect(
	sessionId: string,
	jobId: string,
	filename: string
): Promise<string> {
	const workDir = getJobWorkDir(sessionId, jobId);
	const artifactPath = path.join(workDir, filename);
	const file = Bun.file(artifactPath);
	return await file.text();
}

describe("Code Execution Integration Tests", () => {
	describe("Python", () => {
		test("executes simple Python print", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "python",
				code: 'print("Hello from Python")',
				filename: "test.py",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stdout).toBeDefined();

			// Verify stdout via HTTP
			const stdout = await downloadArtifact(result.artifacts.outputs.stdout!);
			expect(stdout.trim()).toBe("Hello from Python");

			// Verify stdout via direct storage access
			const stdoutDirect = await readArtifactDirect(
				sessionId,
				result.id,
				"stdout"
			);
			expect(stdoutDirect.trim()).toBe("Hello from Python");
		});

		test("Python stderr output", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "python",
				code: 'import sys\nsys.stderr.write("Error message\\n")',
				filename: "test.py",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stderr).toBeDefined();

			const stderr = await downloadArtifact(result.artifacts.outputs.stderr!);
			expect(stderr.trim()).toBe("Error message");
		});

		test("Python creates output file", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "python",
				code: `with open("output.txt", "w") as f:\n    f.write("Python output file")`,
				filename: "test.py",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs["output.txt"]).toBeDefined();

			// Verify file via HTTP
			const output = await downloadArtifact(
				result.artifacts.outputs["output.txt"]!
			);
			expect(output).toBe("Python output file");

			// Verify file via direct storage
			const outputDirect = await readArtifactDirect(
				sessionId,
				result.id,
				"output.txt"
			);
			expect(outputDirect).toBe("Python output file");
		});

		test("Python with stdout, stderr, and file", async () => {
			const sessionId = getSessionId();
			const code = `import sys
print("stdout message")
sys.stderr.write("stderr message\\n")
with open("data.json", "w") as f:
    f.write('{"test": true}')`;

			const result = await executeCode({
				sessionId,
				language: "python",
				code,
				filename: "test.py",
			});

			expect(result.exitCode).toBe(0);

			const stdout = await downloadArtifact(result.artifacts.outputs.stdout!);
			expect(stdout.trim()).toBe("stdout message");

			const stderr = await downloadArtifact(result.artifacts.outputs.stderr!);
			expect(stderr.trim()).toBe("stderr message");

			const dataFile = await downloadArtifact(
				result.artifacts.outputs["data.json"]!
			);
			expect(dataFile).toBe('{"test": true}');
		});
	});

	describe("Node.js", () => {
		test("executes simple Node.js console.log", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "node",
				code: 'console.log("Hello from Node");',
				filename: "test.js",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stdout).toBeDefined();

			const stdout = await downloadArtifact(result.artifacts.outputs.stdout!);
			expect(stdout.trim()).toBe("Hello from Node");
		});

		test("Node.js stderr output", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "node",
				code: 'console.error("Error from Node");',
				filename: "test.js",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stderr).toBeDefined();

			const stderr = await downloadArtifact(result.artifacts.outputs.stderr!);
			expect(stderr.trim()).toBe("Error from Node");
		});

		test("Node.js creates output file", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "node",
				code: `const fs = require('fs');
fs.writeFileSync('result.txt', 'Node output');`,
				filename: "test.js",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs["result.txt"]).toBeDefined();

			const output = await readArtifactDirect(
				sessionId,
				result.id,
				"result.txt"
			);
			expect(output).toBe("Node output");
		});
	});

	describe("Bun", () => {
		test("executes simple Bun console.log", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "bun",
				code: 'console.log("Hello from Bun");',
				filename: "test.js",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stdout).toBeDefined();

			const stdout = await downloadArtifact(result.artifacts.outputs.stdout!);
			expect(stdout.trim()).toBe("Hello from Bun");
		});

		test("Bun creates output file", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "bun",
				code: `await Bun.write('output.txt', 'Bun output');`,
				filename: "test.js",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs["output.txt"]).toBeDefined();

			const output = await downloadArtifact(
				result.artifacts.outputs["output.txt"]!
			);
			expect(output).toBe("Bun output");
		});
	});

	describe("Bash", () => {
		test("executes simple Bash echo", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "bash",
				code: 'echo "Hello from Bash"',
				filename: "test.sh",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stdout).toBeDefined();

			const stdout = await downloadArtifact(result.artifacts.outputs.stdout!);
			expect(stdout.trim()).toBe("Hello from Bash");
		});

		test("Bash stderr output", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "bash",
				code: 'echo "Error message" >&2',
				filename: "test.sh",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stderr).toBeDefined();

			const stderr = await downloadArtifact(result.artifacts.outputs.stderr!);
			expect(stderr.trim()).toBe("Error message");
		});

		test("Bash creates output file", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "bash",
				code: 'echo "Bash output" > output.txt',
				filename: "test.sh",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs["output.txt"]).toBeDefined();

			const output = await readArtifactDirect(
				sessionId,
				result.id,
				"output.txt"
			);
			expect(output.trim()).toBe("Bash output");
		});

		test("Bash with stdout, stderr, and file", async () => {
			const sessionId = getSessionId();
			const code = `echo "stdout line"
echo "stderr line" >&2
echo "file content" > data.txt`;

			const result = await executeCode({
				sessionId,
				language: "bash",
				code,
				filename: "test.sh",
			});

			expect(result.exitCode).toBe(0);

			const stdout = await downloadArtifact(result.artifacts.outputs.stdout!);
			expect(stdout.trim()).toBe("stdout line");

			const stderr = await downloadArtifact(result.artifacts.outputs.stderr!);
			expect(stderr.trim()).toBe("stderr line");

			const dataFile = await downloadArtifact(
				result.artifacts.outputs["data.txt"]!
			);
			expect(dataFile.trim()).toBe("file content");
		});
	});

	describe("Exit Codes", () => {
		test("Python non-zero exit code", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "python",
				code: "import sys\nsys.exit(42)",
				filename: "test.py",
			});

			expect(result.exitCode).toBe(42);
		});

		test("Bash non-zero exit code", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "bash",
				code: "exit 5",
				filename: "test.sh",
			});

			expect(result.exitCode).toBe(5);
		});
	});

	describe("Input Artifacts", () => {
		test("input artifact is listed separately from outputs", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "python",
				code: 'print("test")',
				filename: "script.py",
			});

			expect(result.exitCode).toBe(0);

			// Check input artifact
			expect(result.artifacts.inputs["script.py"]).toBeDefined();

			// Check output artifacts don't include input
			expect(result.artifacts.outputs["script.py"]).toBeUndefined();
			expect(result.artifacts.outputs.stdout).toBeDefined();
			expect(result.artifacts.outputs.stderr).toBeDefined();
		});
	});

	describe("Empty Output", () => {
		test("empty stdout and stderr are still created", async () => {
			const sessionId = getSessionId();
			const result = await executeCode({
				sessionId,
				language: "python",
				code: "pass",
				filename: "test.py",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stdout).toBeDefined();
			expect(result.artifacts.outputs.stderr).toBeDefined();

			const stdout = await downloadArtifact(result.artifacts.outputs.stdout!);
			expect(stdout).toBe("");

			const stderr = await downloadArtifact(result.artifacts.outputs.stderr!);
			expect(stderr).toBe("");
		});
	});
});
