import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  formatRelativeTimestamp,
  formatResultsForClipboard,
  formatSourcesForMetadata,
  markdownForAIAnswer,
} from "./lib/format";
import { searchHistory, ScoredHistoryEntry } from "./lib/history";
import { deleteHistoryEntry, getHistory, pruneHistory, getSettings } from "./lib/storage";
import { BraveSearchEntry } from "./lib/types";
import { buildAskUrl, buildSearchUrl } from "./lib/urls";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [history, setHistory] = useState<BraveSearchEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void reloadHistory(setHistory, setIsLoading);
  }, []);

  const matches = useMemo(() => searchHistory(history, searchText), [history, searchText]);

  return (
    <List
      filtering={false}
      isLoading={isLoading}
      isShowingDetail
      navigationTitle="Search History"
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search local Brave history..."
      searchText={searchText}
      throttle={false}
    >
      <List.EmptyView
        icon={Icon.Clock}
        title="No Search History"
        description="Searches appear here when local history retention is enabled."
      />
      <List.Section title="Search history">
        {matches.map((match) => (
          <HistoryItem
            key={match.entry.id}
            match={match}
            onDelete={() => reloadHistory(setHistory, setIsLoading)}
          />
        ))}
      </List.Section>
    </List>
  );
}

async function reloadHistory(
  setHistory: React.Dispatch<React.SetStateAction<BraveSearchEntry[]>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
): Promise<void> {
  setIsLoading(true);
  const settings = await getSettings();
  await pruneHistory(settings.retention);
  setHistory(await getHistory());
  setIsLoading(false);
}

function HistoryItem({ match, onDelete }: { match: ScoredHistoryEntry; onDelete: () => void }) {
  const entry = match.entry;
  const allResultsContent = formatResultsForClipboard(entry.results);
  const answer = entry.aiAnswer || "No AI answer was saved for this search.";

  return (
    <List.Item
      id={entry.id}
      icon={Icon.Clock}
      title={entry.query}
      subtitle={entry.results[0]?.displayUrl}
      accessories={[{ text: formatRelativeTimestamp(entry.updatedAt) }]}
      detail={
        <List.Item.Detail
          markdown={markdownForAIAnswer(answer)}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Query" text={entry.query} />
              <List.Item.Detail.Metadata.Label
                title="Saved"
                text={new Date(entry.updatedAt).toLocaleString()}
              />
              <List.Item.Detail.Metadata.Label
                title="Suggestions"
                text={entry.suggestions.slice(0, 4).join(", ") || "None"}
              />
              <List.Item.Detail.Metadata.Label title="Top Results" text={String(entry.results.length)} />
              <List.Item.Detail.Metadata.Label
                title="Notice"
                text="AI-generated answer. Please verify critical facts."
              />
              {entry.aiSources.length > 0 ? <List.Item.Detail.Metadata.Separator /> : null}
              {formatSourcesForMetadata(entry.aiSources).map((source, index) => (
                <List.Item.Detail.Metadata.Link
                  key={`${source.url}:${index}`}
                  title={index === 0 ? "Sources" : ""}
                  text={source.title}
                  target={source.url}
                />
              ))}
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy AI Answer" icon={Icon.Clipboard} content={answer} />
          <Action.Paste title="Paste AI Answer" icon={Icon.TextCursor} content={answer} />
          <Action.OpenInBrowser
            title="Open Brave Search"
            icon={Icon.MagnifyingGlass}
            url={buildSearchUrl(entry.query)}
          />
          <Action.OpenInBrowser
            title="Open AI Conversation"
            icon={Icon.Globe}
            url={buildAskUrl(entry.query, entry.conversationId)}
          />
          {entry.results.length > 0 ? (
            <Action.CopyToClipboard
              title="Copy All Top Results"
              icon={Icon.List}
              content={allResultsContent}
              shortcut={{ modifiers: ["cmd", "ctrl"], key: "enter" }}
            />
          ) : null}
          <Action
            title="Delete Search from History"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            onAction={async () => {
              await deleteHistoryEntry(entry.id);
              await showToast({ style: Toast.Style.Success, title: "Deleted search from history" });
              onDelete();
            }}
          />
        </ActionPanel>
      }
    />
  );
}
