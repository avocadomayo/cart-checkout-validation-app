import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  Text,
  Form,
  ChoiceList,
} from "@shopify/ui-extensions-react/admin";
import { useState } from "react";

// The target used here must match the target used in the extension's toml file (./shopify.extension.toml)
const TARGET = "admin.product-details.block.render";

enum FunctionResult {
  Success = "success",
  ValidationError = "validation-error",
  Failure = "failure",
}

export default reactExtension(TARGET, () => <App />);

function App() {
  // The useApi hook provides access to several useful APIs like i18n and data.
  const { i18n } = useApi(TARGET);
  const [configuration, setConfiguration] = useState();

  console.log({ configuration });

  return (
    // The AdminBlock component provides an API for setting the title of the Block extension wrapper.
    <AdminBlock title="My Block Extension">
      <BlockStack>
        <Text fontWeight="bold">{i18n.translate("welcome", { TARGET })}</Text>
        <Form
          onSubmit={() => {
            console.log("happy form");
          }}
          onReset={() => {
            console.log("happy reset");
          }}
        >
          <ChoiceList
            name="Function result"
            choices={Object.keys(FunctionResult).map((key) => ({
              label: key,
              id: FunctionResult[key],
            }))}
            value={configuration}
            multiple={false}
            onChange={(value) => setConfiguration(value)}
          />
        </Form>
      </BlockStack>
    </AdminBlock>
  );
}
