import {
  isProviderError,
  settingsFromEnvironment,
  runIntakeRecognitionEvaluation,
} from "./modules/inventory/intake/recognition/evaluation.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

const manifestPath = argument("--manifest");
if (!manifestPath) {
  console.error(
    "Usage: npm run evaluate:intake-recognition -- --manifest <path> [--allow-live]",
  );
  process.exitCode = 2;
} else {
  try {
    const report = await runIntakeRecognitionEvaluation({
      manifestPath,
      settings: settingsFromEnvironment(process.env),
      allowLive: process.argv.includes("--allow-live"),
    });
    // stdout is the machine-readable aggregate report. No image bytes,
    // filenames, prompts, provider payloads, or credentials are printed.
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const message = isProviderError(error)
      ? `Recognition evaluation failed: ${error.code}`
      : "Recognition evaluation failed";
    console.error(message);
    process.exitCode = 1;
  }
}
