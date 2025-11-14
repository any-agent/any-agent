import { describe, test, expect } from "bun:test";
import { ToolResponseSchema } from "../../src/core/schemas";
import { getJobWorkDir } from "../../src/core/storage";
import path from "path";

const ENDPOINT = process.env.INTEGRATION_TEST_ENDPOINT || "http://localhost:8080";

function getSessionId(): string {
	return `int-test-doc-${Date.now()}`;
}

async function convertDocument(params: {
	sessionId: string;
	fileContent: string; // base64 encoded
	filename: string;
	conversionScript: string;
	timeout?: number;
}) {
	const response = await fetch(`${ENDPOINT}/tools/execute`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			tool: "document_converter",
			...params,
		}),
	});

	expect(response.ok).toBe(true);
	const data = await response.json();

	// Validate response schema
	const validated = ToolResponseSchema.parse(data);
	return validated;
}

async function downloadArtifact(url: string): Promise<string> {
	const response = await fetch(url);
	expect(response.ok).toBe(true);
	return await response.text();
}

async function downloadArtifactBinary(url: string): Promise<Buffer> {
	const response = await fetch(url);
	expect(response.ok).toBe(true);
	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
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

describe("Document Converter Integration Tests", () => {
	describe("HTML to Markdown", () => {
		test("converts simple HTML to Markdown", async () => {
			const sessionId = getSessionId();
			const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<h1>Hello World</h1>
<p>This is a <strong>test</strong>.</p>
</body>
</html>`;

			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				conversionScript: "pandoc test.html -o output.md",
			});

			expect(result.exitCode).toBe(0);
			expect(result.tool).toBe("document_converter");
			expect(result.artifacts.inputs["test.html"]).toBeDefined();
			expect(result.artifacts.outputs["output.md"]).toBeDefined();

			// Verify the markdown output
			const markdown = await downloadArtifact(
				result.artifacts.outputs["output.md"]!
			);
			expect(markdown).toContain("Hello World");
			expect(markdown).toContain("**test**");
		});

		test("converts HTML with lists to Markdown", async () => {
			const sessionId = getSessionId();
			const htmlContent = `<!DOCTYPE html>
<html>
<body>
<h2>Features</h2>
<ul>
<li>Item 1</li>
<li>Item 2</li>
<li>Item 3</li>
</ul>
</body>
</html>`;

			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "list.html",
				conversionScript: "pandoc list.html -o output.md",
			});

			expect(result.exitCode).toBe(0);

			const markdown = await downloadArtifact(
				result.artifacts.outputs["output.md"]!
			);
			expect(markdown).toContain("Features");
			expect(markdown).toContain("Item 1");
			expect(markdown).toContain("Item 2");
			expect(markdown).toContain("Item 3");
		});

		test("converts HTML with code blocks to Markdown", async () => {
			const sessionId = getSessionId();
			const htmlContent = `<!DOCTYPE html>
<html>
<body>
<h1>Code Example</h1>
<pre><code>console.log("Hello");</code></pre>
</body>
</html>`;

			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "code.html",
				conversionScript: "pandoc code.html -o output.md",
			});

			expect(result.exitCode).toBe(0);

			const markdown = await downloadArtifact(
				result.artifacts.outputs["output.md"]!
			);
			expect(markdown).toContain("Code Example");
			expect(markdown).toContain('console.log("Hello")');
		});
	});

	describe("PDF Conversion", () => {
		test("converts PDF to text using pdftotext", async () => {
			const sessionId = getSessionId();
			// Create a minimal PDF (this is a valid minimal PDF structure)
			const minimalPdf = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000317 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
410
%%EOF`;

			const base64Content = Buffer.from(minimalPdf).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.pdf",
				conversionScript: "pdftotext test.pdf output.txt",
				timeout: 10,
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs["output.txt"]).toBeDefined();

			const textContent = await downloadArtifact(
				result.artifacts.outputs["output.txt"]!
			);
			expect(textContent).toContain("Test PDF");
		});

		test("converts PDF to Markdown using pdftohtml + pandoc", async () => {
			const sessionId = getSessionId();
			// Same minimal PDF
			const minimalPdf = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000317 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
410
%%EOF`;

			const base64Content = Buffer.from(minimalPdf).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.pdf",
				conversionScript:
					"pdftohtml -s -i test.pdf temp && pandoc temp-html.html -o output.md",
				timeout: 10,
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs["output.md"]).toBeDefined();

			const markdown = await downloadArtifact(
				result.artifacts.outputs["output.md"]!
			);
			expect(markdown).toContain("Test PDF");
		});
	});

	describe("Binary File Integrity", () => {
		test("preserves binary PDF data without corruption", async () => {
			const sessionId = getSessionId();
			// Create a PDF with specific byte patterns
			const pdfWithBinaryData = Buffer.from([
				// PDF header
				0x25,
				0x50,
				0x44,
				0x46,
				0x2d,
				0x31,
				0x2e,
				0x34,
				0x0a,
				// Some binary data
				0x00,
				0xff,
				0xaa,
				0x55,
				0x01,
				0xfe,
			]);

			const base64Content = pdfWithBinaryData.toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "binary.pdf",
				// Just copy the file to verify it was written correctly
				conversionScript: "cp binary.pdf binary-copy.pdf",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.inputs["binary.pdf"]).toBeDefined();

			// Download the input artifact and verify it matches
			const downloadedPdf = await downloadArtifactBinary(
				result.artifacts.inputs["binary.pdf"]!
			);
			expect(downloadedPdf).toEqual(pdfWithBinaryData);
			expect(downloadedPdf.length).toBe(pdfWithBinaryData.length);

			// Verify specific bytes
			expect(downloadedPdf[0]).toBe(0x25); // %
			expect(downloadedPdf[1]).toBe(0x50); // P
			expect(downloadedPdf[2]).toBe(0x44); // D
			expect(downloadedPdf[3]).toBe(0x46); // F
			expect(downloadedPdf[9]).toBe(0x00);
			expect(downloadedPdf[10]).toBe(0xff);
		});
	});

	describe("Input and Output Artifacts", () => {
		test("separates input file from output files", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body><h1>Test</h1></body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "input.html",
				conversionScript: "pandoc input.html -o output.md",
			});

			expect(result.exitCode).toBe(0);

			// Input artifact
			expect(result.artifacts.inputs["input.html"]).toBeDefined();

			// Output artifacts (should not include input)
			expect(result.artifacts.outputs["input.html"]).toBeUndefined();
			expect(result.artifacts.outputs["output.md"]).toBeDefined();
			expect(result.artifacts.outputs.stdout).toBeDefined();
			expect(result.artifacts.outputs.stderr).toBeDefined();
		});

		test("includes intermediate files in outputs", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body><p>Test</p></body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				// Create intermediate file
				conversionScript:
					"cp test.html intermediate.html && pandoc intermediate.html -o output.md",
			});

			expect(result.exitCode).toBe(0);

			// Should have intermediate file in outputs
			expect(result.artifacts.outputs["intermediate.html"]).toBeDefined();
			expect(result.artifacts.outputs["output.md"]).toBeDefined();
		});
	});

	describe("Stdout and Stderr", () => {
		test("captures stdout from conversion commands", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body>Test</body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				conversionScript: 'echo "Converting..." && pandoc test.html -o output.md',
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stdout).toBeDefined();

			const stdout = await downloadArtifact(result.artifacts.outputs.stdout!);
			expect(stdout).toContain("Converting...");
		});

		test("captures stderr from pandoc warnings", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body>Test</body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				conversionScript:
					'echo "Warning message" >&2 && pandoc test.html -o output.md',
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs.stderr).toBeDefined();

			const stderr = await downloadArtifact(result.artifacts.outputs.stderr!);
			expect(stderr).toContain("Warning message");
		});
	});

	describe("Error Handling", () => {
		test("handles non-existent input file", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body>Test</body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				// Try to convert a file that doesn't exist
				conversionScript: "pandoc nonexistent.html -o output.md",
			});

			// Should have non-zero exit code
			expect(result.exitCode).not.toBe(0);
			expect(result.artifacts.outputs.stderr).toBeDefined();

			const stderr = await downloadArtifact(result.artifacts.outputs.stderr!);
			expect(stderr).toContain("nonexistent.html");
		});

		test("handles invalid pandoc syntax", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body>Test</body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				// Invalid pandoc command
				conversionScript: "pandoc --invalid-flag test.html -o output.md",
			});

			// Should have non-zero exit code
			expect(result.exitCode).not.toBe(0);
			expect(result.artifacts.outputs.stderr).toBeDefined();
		});
	});

	describe("Timeout", () => {
		test("conversion times out after specified duration", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body>Test</body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				// Sleep longer than timeout
				conversionScript: "sleep 3 && pandoc test.html -o output.md",
				timeout: 1,
			});

			// Should have exit code -1 for timeout
			expect(result.exitCode).toBe(-1);
			expect(result.artifacts.outputs.stderr).toBeDefined();

			const stderr = await downloadArtifact(result.artifacts.outputs.stderr!);
			expect(stderr).toContain("Conversion timed out");
			expect(stderr).toContain("timeout was set to 1s");
		});

		test("conversion completes within timeout", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body>Fast conversion</body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				conversionScript: "pandoc test.html -o output.md",
				timeout: 10,
			});

			expect(result.exitCode).toBe(0);

			const markdown = await downloadArtifact(
				result.artifacts.outputs["output.md"]!
			);
			expect(markdown).toContain("Fast conversion");
		});
	});

	describe("Complex Conversions", () => {
		test("chains multiple conversion commands", async () => {
			const sessionId = getSessionId();
			const htmlContent = `<html><body>
<h1>Title</h1>
<p>Paragraph 1</p>
<p>Paragraph 2</p>
</body></html>`;
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				conversionScript:
					"pandoc test.html -o temp.md && cat temp.md && cp temp.md output.md",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs["output.md"]).toBeDefined();
			expect(result.artifacts.outputs["temp.md"]).toBeDefined();

			const markdown = await downloadArtifact(
				result.artifacts.outputs["output.md"]!
			);
			expect(markdown).toContain("Title");
			expect(markdown).toContain("Paragraph 1");
			expect(markdown).toContain("Paragraph 2");
		});

		test("converts with custom pandoc options", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body><h1>Test</h1></body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "test.html",
				// Use custom pandoc options
				conversionScript: "pandoc test.html -t gfm --wrap=none -o output.md",
			});

			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs["output.md"]).toBeDefined();

			const markdown = await downloadArtifact(
				result.artifacts.outputs["output.md"]!
			);
			expect(markdown).toContain("Test");
		});
	});

	describe("Empty and Edge Cases", () => {
		test("handles minimal HTML file", async () => {
			const sessionId = getSessionId();
			const htmlContent = "<html><body></body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "minimal.html",
				conversionScript: "pandoc minimal.html -o output.md",
			});

			// Pandoc should handle this gracefully
			expect(result.exitCode).toBe(0);
			expect(result.artifacts.outputs["output.md"]).toBeDefined();
		});

		test("handles HTML with special characters", async () => {
			const sessionId = getSessionId();
			const htmlContent =
				"<html><body><p>Special: €, ñ, 中文, 🚀</p></body></html>";
			const base64Content = Buffer.from(htmlContent).toString("base64");

			const result = await convertDocument({
				sessionId,
				fileContent: base64Content,
				filename: "special.html",
				conversionScript: "pandoc special.html -o output.md",
			});

			expect(result.exitCode).toBe(0);

			const markdown = await downloadArtifact(
				result.artifacts.outputs["output.md"]!
			);
			expect(markdown).toContain("€");
			expect(markdown).toContain("ñ");
			expect(markdown).toContain("中文");
			expect(markdown).toContain("🚀");
		});
	});
});
