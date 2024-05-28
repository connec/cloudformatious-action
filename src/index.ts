import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";

const INSTALLER =
  "curl --proto =https --tlsv1.2 -LsSf https://github.com/connec/cloudformatious-cli/releases/${version}/download/cloudformatious-cli-installer.sh | sh";

const OPERATIONS = ["apply-stack", "install"] as const;

const ARGS: { [id: string]: Arg } = {
  "stack-name": {
    parser: core.getInput,
    required: true,
  },
  "template-path": {
    parser: core.getInput,
    required: true,
  },
  capabilities: {
    parser: core.getMultilineInput,
  },
  "client-request-token": {
    parser: core.getInput,
  },
  "notification-arns": {
    parser: core.getMultilineInput,
  },
  "package-bucket": {
    parser: core.getInput,
  },
  "package-prefix": {
    parser: core.getInput,
  },
  parameters: {
    parser: core.getMultilineInput,
  },
  "resource-types": {
    parser: core.getMultilineInput,
  },
  "role-arn": {
    parser: core.getInput,
  },
  tags: {
    parser: core.getMultilineInput,
  },
};

type Arg = {
  parser: (id: string, opts?: { required?: boolean }) => string | string[];
  required?: boolean;
};

try {
  const version = core.getInput("version", { required: true })

  const operation = OPERATIONS.find(
    (op) => op === core.getInput("operation", { required: true }),
  );

  let handled: true;

  switch (operation) {
    case "install":
      await install(version);
      handled = true;
      break;
    case "apply-stack":
      await applyStack(version);
      handled = true;
      break;
    case undefined:
      throw new Error(`unknown operation: ${operation}`);
  }

  // This is checked at compile-time due to the reference to `handled`, which must be assigned before use
  console.assert(handled, `BUG: unhandled operation ${operation}`);
} catch (error) {
  core.setFailed(error instanceof Error ? error : String(error));
}

async function install(version: string): Promise<void> {
  // We could cache this, but it would likely end up using the same infrastructure as the artifact
  // hosting, so little to nothing would be saved.
  await exec("sh", ["-c", INSTALLER.replace('${version}', version)]);
}

async function applyStack(version: string): Promise<void> {
  await core.group("Install cloudformatious", async () => {
    await install(version);
  });

  const args = [
    "apply-stack",
    ...Object.entries(ARGS).flatMap(([id, arg]) => getArg(id, arg)),
  ];

  // Execute cloudformatious with the gathered arguments
  const result = await getExecOutput("cloudformatious", args, {
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).flatMap(([k, v]) => (v ? [[k, v]] : [])),
      ),
      CLICOLOR_FORCE: "1",
    },
  });

  // Parse the stack outputs
  let outputs: {};
  try {
    const rawOutputs: unknown = JSON.parse(result.stdout);
    if (!rawOutputs || typeof rawOutputs !== "object") {
      throw new Error("expected a JSON object");
    }

    outputs = rawOutputs;
  } catch (error) {
    throw new Error(
      `BUG: unexpected output from cloudformatious: ${error}\n\nOutput:\n\n${result.stdout}`,
    );
  }

  // Set the outputs as step outputs
  for (const [key, value] of Object.entries(outputs)) {
    core.setOutput(key, value);
  }
}

function getArg(id: string, arg: Arg): string[] {
  const values = arg.parser(id, arg.required ? { required: arg.required } : {});

  if (values.length === 0) {
    return [];
  }

  return [`--${id}`, ...(Array.isArray(values) ? values : [values])];
}
