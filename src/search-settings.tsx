import { Action, ActionPanel, Alert, confirmAlert, Form, Icon, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import {
  clearHistory,
  DEFAULT_SETTINGS,
  getHistory,
  getSettings,
  RETENTION_OPTIONS,
  setSettings,
  pruneHistory,
} from "./lib/storage";
import { COMPLETION_SUGGESTION_OPTIONS } from "./lib/suggestions";
import { CompletionSuggestionCount, RetentionPolicy, SearchSettings } from "./lib/types";

interface SettingsFormValues {
  retention: RetentionPolicy;
  completionSuggestionCount: string;
}

export default function Command() {
  const [settings, setLocalSettings] = useState<SearchSettings>(DEFAULT_SETTINGS);
  const [historyCount, setHistoryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void reload(setLocalSettings, setHistoryCount, setIsLoading);
  }, []);

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Search Settings"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Settings"
            icon={Icon.Check}
            onSubmit={async (values: SettingsFormValues) => {
              const nextSettings: SearchSettings = {
                retention: values.retention,
                completionSuggestionCount: Number(
                  values.completionSuggestionCount,
                ) as CompletionSuggestionCount,
              };
              await setSettings(nextSettings);
              await reload(setLocalSettings, setHistoryCount, setIsLoading);
              await showToast({ style: Toast.Style.Success, title: "Saved search settings" });
            }}
          />
          <Action
            title="Prune History Now"
            icon={Icon.ArrowClockwise}
            onAction={async () => {
              const currentSettings = await getSettings();
              await pruneHistory(currentSettings.retention);
              await reload(setLocalSettings, setHistoryCount, setIsLoading);
              await showToast({ style: Toast.Style.Success, title: "Pruned search history" });
            }}
          />
          <Action
            title="Clear All Search History"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            onAction={async () => {
              const confirmed = await confirmAlert({
                title: "Clear all search history?",
                message: "This deletes locally saved queries, AI answers, suggestions, and web results.",
                primaryAction: {
                  title: "Clear History",
                  style: Alert.ActionStyle.Destructive,
                },
              });
              if (!confirmed) {
                return;
              }
              await clearHistory();
              await reload(setLocalSettings, setHistoryCount, setIsLoading);
              await showToast({ style: Toast.Style.Success, title: "Cleared search history" });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="retention"
        title="History Retention"
        value={settings.retention}
        onChange={(retention) => {
          setLocalSettings((previous) => ({ ...previous, retention: retention as RetentionPolicy }));
        }}
      >
        {RETENTION_OPTIONS.map((option) => (
          <Form.Dropdown.Item
            key={option.value}
            value={option.value}
            title={option.title}
            icon={settings.retention === option.value ? Icon.CheckCircle : Icon.Circle}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="completionSuggestionCount"
        title="Completion Suggestions"
        value={String(settings.completionSuggestionCount)}
        onChange={(completionSuggestionCount) => {
          setLocalSettings((previous) => ({
            ...previous,
            completionSuggestionCount: Number(completionSuggestionCount) as CompletionSuggestionCount,
          }));
        }}
      >
        {COMPLETION_SUGGESTION_OPTIONS.map((option) => (
          <Form.Dropdown.Item
            key={option.value}
            value={String(option.value)}
            title={option.title}
            icon={settings.completionSuggestionCount === option.value ? Icon.CheckCircle : Icon.Circle}
          />
        ))}
      </Form.Dropdown>
      <Form.Description title="Saved Searches" text={String(historyCount)} />
      <Form.Description
        title="Storage"
        text="Raycast local extension storage. No accounts, API keys, or telemetry."
      />
    </Form>
  );
}

async function reload(
  setLocalSettings: React.Dispatch<React.SetStateAction<SearchSettings>>,
  setHistoryCount: React.Dispatch<React.SetStateAction<number>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
): Promise<void> {
  setIsLoading(true);
  const settings = await getSettings();
  setLocalSettings(settings);
  setHistoryCount((await getHistory()).length);
  setIsLoading(false);
}
