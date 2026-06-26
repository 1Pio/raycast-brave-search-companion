import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "./hooks/use-debounced-value";
import { fetchAIAnswer, fetchSearchPage, fetchSuggestions } from "./lib/brave";
import {
  formatResultsForClipboard,
  formatSourcesForMetadata,
  markdownForAIAnswer,
  markdownForResultPreview,
} from "./lib/format";
import { compactWhitespace, truncate } from "./lib/text";
import { limitCompletionSuggestions, prepareCompletionSuggestions } from "./lib/suggestions";
import { BraveAIAnswer, BraveSearchEntry, BraveSource, BraveWebResult, SearchSettings } from "./lib/types";
import { buildAskUrl, buildSearchUrl } from "./lib/urls";
import {
  DEFAULT_SETTINGS,
  deleteHistoryForQuery,
  getHistoryEntryForQuery,
  getSettings,
  pruneHistory,
  saveSearchEntry,
} from "./lib/storage";

const SEARCH_DEBOUNCE_MS = 500;

export interface SearchState {
  query: string;
  isLoading: boolean;
  suggestions: string[];
  results: BraveWebResult[];
  ai: BraveAIAnswer;
}

interface SearchPageResult {
  conversationId?: string;
  results: BraveWebResult[];
}

interface ResolvedSearchPageResult extends SearchPageResult {
  isLive: boolean;
  error?: unknown;
}

const emptyAI: BraveAIAnswer = {
  answer: "",
  sources: [],
  status: "idle",
};

const emptyState: SearchState = {
  query: "",
  isLoading: false,
  suggestions: [],
  results: [],
  ai: emptyAI,
};

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [state, setState] = useState<SearchState>(emptyState);
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SETTINGS);
  const debouncedQuery = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    getSettings()
      .then((storedSettings) => {
        setSettings(storedSettings);
        return pruneHistory(storedSettings.retention);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const query = compactWhitespace(debouncedQuery);
    if (!query) {
      setState(emptyState);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;
    void runSearch(query, settings, signal, setState);

    return () => controller.abort();
  }, [debouncedQuery, settings]);

  const allResultsContent = useMemo(() => formatResultsForClipboard(state.results), [state.results]);

  return (
    <List
      filtering={false}
      isLoading={state.isLoading}
      isShowingDetail
      navigationTitle="Search Brave"
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search Brave..."
      searchText={searchText}
      throttle={false}
    >
      <List.Section title="AI response">
        <AIResponseItem state={state} allResultsContent={allResultsContent} />
      </List.Section>

      {settings.completionSuggestionCount > 0 && state.suggestions.length > 0 ? (
        <List.Section title="Completion suggestions">
          {state.suggestions.map((suggestion) => (
            <List.Item
              key={suggestion}
              id={`suggestion:${suggestion}`}
              icon={Icon.MagnifyingGlass}
              title={suggestion}
              actions={
                <ActionPanel>
                  <Action
                    title="Use Completion"
                    icon={Icon.ArrowRight}
                    onAction={() => {
                      setSearchText(suggestion);
                    }}
                  />
                  <AIAnswerActions answer={state.ai.answer} />
                  <SearchOpenActions
                    query={state.query || suggestion}
                    conversationId={state.ai.conversationId}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}

      {state.results.length > 0 ? (
        <List.Section title="Top web results">
          {state.results.map((result) => (
            <WebResultItem
              key={result.id}
              result={result}
              allResultsContent={allResultsContent}
              query={state.query}
              conversationId={state.ai.conversationId}
              aiAnswer={state.ai.answer}
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

export async function runSearch(
  query: string,
  settings: SearchSettings,
  signal: AbortSignal,
  setState: Dispatch<SetStateAction<SearchState>>,
): Promise<void> {
  setState((previous) =>
    previous.query === query
      ? {
          ...previous,
          isLoading: true,
          ai: {
            ...previous.ai,
            error: undefined,
            status: previous.ai.answer ? previous.ai.status : "loading",
          },
        }
      : {
          query,
          isLoading: true,
          suggestions: [],
          results: [],
          ai: {
            ...emptyAI,
            status: "loading",
          },
        },
  );

  const cachedEntryPromise = getHistoryEntryForQuery(query).catch(() => undefined);
  cachedEntryPromise.then((cachedEntry) => {
    if (!cachedEntry || signal.aborted) {
      return;
    }

    setState((previous) =>
      previous.query === query
        ? {
            ...previous,
            suggestions:
              previous.suggestions.length > 0
                ? previous.suggestions
                : cachedSuggestionsForDisplay(cachedEntry, settings),
            results: previous.results.length > 0 ? previous.results : cachedEntry.results,
            ai: cachedEntry.aiAnswer
              ? {
                  answer: cachedEntry.aiAnswer,
                  conversationId: cachedEntry.conversationId,
                  sources: cachedEntry.aiSources,
                  status: "ready",
                }
              : previous.ai,
          }
        : previous,
    );
  });

  const suggestionsPromise =
    settings.completionSuggestionCount === 0
      ? Promise.resolve([])
      : fetchSuggestions(query, signal)
          .then((suggestions) =>
            prepareCompletionSuggestions(suggestions, settings.completionSuggestionCount),
          )
          .catch(async () => {
            const cachedEntry = await cachedEntryPromise;
            return cachedEntry ? cachedSuggestionsForDisplay(cachedEntry, settings) : [];
          });
  suggestionsPromise.then((suggestions) => {
    if (!signal.aborted) {
      setState((previous) => (previous.query === query ? { ...previous, suggestions } : previous));
    }
  });

  const searchPagePromise = fetchSearchPage(query, signal)
    .then(async (searchPage): Promise<ResolvedSearchPageResult> => {
      if (!hasSearchContext(searchPage)) {
        const cachedEntry = await cachedEntryPromise;
        return {
          conversationId: cachedEntry?.conversationId,
          results: cachedEntry?.results ?? [],
          isLive: false,
          error: new Error("Brave Search returned no parseable results."),
        };
      }

      if (!signal.aborted) {
        const fallbackSources = searchPage.results.map(resultToSource);
        setState((previous) =>
          previous.query === query
            ? {
                ...previous,
                results: searchPage.results,
                ai: {
                  ...previous.ai,
                  conversationId: previous.ai.conversationId ?? searchPage.conversationId,
                  sources: previous.ai.sources.length > 0 ? previous.ai.sources : fallbackSources,
                },
              }
            : previous,
        );
      }

      return { ...searchPage, isLive: true };
    })
    .catch(async (error: unknown): Promise<ResolvedSearchPageResult> => {
      const cachedEntry = await cachedEntryPromise;
      return {
        conversationId: cachedEntry?.conversationId,
        results: cachedEntry?.results ?? [],
        isLive: false,
        error,
      };
    });

  const aiPromise = searchPagePromise
    .then(async (searchPage): Promise<BraveAIAnswer> => {
      const fallbackSources = searchPage.results.map(resultToSource);
      if (!searchPage.isLive) {
        const cachedEntry = await cachedEntryPromise;
        if (cachedEntry?.aiAnswer) {
          return {
            answer: cachedEntry.aiAnswer,
            conversationId: cachedEntry.conversationId ?? searchPage.conversationId,
            sources: cachedEntry.aiSources.length > 0 ? cachedEntry.aiSources : fallbackSources,
            status: "ready",
          };
        }

        return {
          answer: "",
          conversationId: searchPage.conversationId,
          sources: fallbackSources,
          status: "error",
          error: errorMessage(searchPage.error, "Brave Search request failed."),
        };
      }

      const ai = await fetchAIAnswer(query, searchPage.conversationId, fallbackSources, signal);

      if (ai.status === "error" || (!ai.answer && ai.status !== "loading" && ai.status !== "idle")) {
        const cachedEntry = await cachedEntryPromise;
        if (cachedEntry?.aiAnswer) {
          return {
            answer: cachedEntry.aiAnswer,
            conversationId: cachedEntry.conversationId ?? ai.conversationId ?? searchPage.conversationId,
            sources: cachedEntry.aiSources.length > 0 ? cachedEntry.aiSources : fallbackSources,
            status: "ready",
          };
        }
      }

      return ai;
    })
    .catch(async (error: unknown): Promise<BraveAIAnswer> => {
      if (signal.aborted) {
        return { ...emptyAI, status: "idle" };
      }

      const cachedEntry = await cachedEntryPromise;
      if (cachedEntry?.aiAnswer) {
        return {
          answer: cachedEntry.aiAnswer,
          conversationId: cachedEntry.conversationId,
          sources: cachedEntry.aiSources,
          status: "ready",
        };
      }

      return {
        answer: "",
        sources: [],
        status: "error",
        error: errorMessage(error, "AI answer request failed."),
      };
    });

  aiPromise.then((ai) => {
    if (!signal.aborted) {
      setState((previous) => (previous.query === query ? { ...previous, ai } : previous));
    }
  });

  const [suggestions, searchPage, ai] = await Promise.all([suggestionsPromise, searchPagePromise, aiPromise]);

  if (signal.aborted) {
    return;
  }

  const fallbackSources = searchPage.results.map(resultToSource);
  const finalAI = {
    ...ai,
    conversationId: ai.conversationId ?? searchPage.conversationId,
    sources: ai.sources.length > 0 ? ai.sources : fallbackSources,
  };

  setState((previous) =>
    previous.query === query
      ? {
          query,
          isLoading: false,
          suggestions,
          results: searchPage.results,
          ai: finalAI,
        }
      : previous,
  );

  if (
    finalAI.answer ||
    finalAI.sources.length > 0 ||
    suggestions.length > 0 ||
    searchPage.results.length > 0
  ) {
    await saveSearchEntry({
      query,
      conversationId: finalAI.conversationId,
      aiAnswer: finalAI.answer,
      aiSources: finalAI.sources,
      suggestions,
      results: searchPage.results,
    });
  }
}

function AIResponseItem({ state, allResultsContent }: { state: SearchState; allResultsContent: string }) {
  const title = getAIItemTitle(state);
  const answer = state.ai.answer;
  const query = state.query;
  const conversationId = state.ai.conversationId;

  return (
    <List.Item
      id="ai-response"
      icon={Icon.Document}
      title={title}
      subtitle={query}
      detail={
        <List.Item.Detail
          isLoading={state.ai.status === "loading"}
          markdown={markdownForAIAnswer(answer)}
          metadata={<AIResponseMetadata ai={state.ai} query={query} results={state.results} />}
        />
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy AI Answer"
            icon={Icon.Clipboard}
            content={answer || "No AI answer is available for this query."}
          />
          <PasteAIAnswerAction answer={answer} />
          <SearchOpenActions query={query} conversationId={conversationId} />
          {state.results.length > 0 ? (
            <Action.CopyToClipboard
              title="Copy All Top Results"
              icon={Icon.List}
              content={allResultsContent}
              shortcut={{ modifiers: ["cmd", "ctrl"], key: "enter" }}
            />
          ) : null}
          {query ? <DeleteSearchAction query={query} /> : null}
        </ActionPanel>
      }
    />
  );
}

function WebResultItem({
  result,
  allResultsContent,
  query,
  conversationId,
  aiAnswer,
}: {
  result: BraveWebResult;
  allResultsContent: string;
  query: string;
  conversationId?: string;
  aiAnswer: string;
}) {
  return (
    <List.Item
      id={`result:${result.id}`}
      icon={result.faviconUrl ? { source: result.faviconUrl } : Icon.Globe}
      title={result.title}
      subtitle={result.displayUrl}
      detail={
        <List.Item.Detail
          markdown={markdownForResultPreview(result)}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Title" text={result.title} />
              <List.Item.Detail.Metadata.Link title="URL" text={result.url} target={result.url} />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open Result" url={result.url} />
          <Action.CopyToClipboard title="Copy Result URL" icon={Icon.Clipboard} content={result.url} />
          <Action.CopyToClipboard
            title="Copy All Top Results"
            icon={Icon.List}
            content={allResultsContent}
            shortcut={{ modifiers: ["cmd", "ctrl"], key: "enter" }}
          />
          <AIAnswerActions answer={aiAnswer} />
          <SearchOpenActions query={query} conversationId={conversationId} />
          {query ? <DeleteSearchAction query={query} /> : null}
        </ActionPanel>
      }
    />
  );
}

function AIAnswerActions({ answer }: { answer: string }) {
  const content = answer || "No AI answer is available for this query.";

  return (
    <ActionPanel.Section>
      <Action.CopyToClipboard title="Copy AI Answer" icon={Icon.Clipboard} content={content} />
      <PasteAIAnswerAction answer={answer} />
    </ActionPanel.Section>
  );
}

function PasteAIAnswerAction({ answer }: { answer: string }) {
  return (
    <Action.Paste
      title="Paste AI Answer"
      icon={Icon.TextCursor}
      content={answer || "No AI answer is available for this query."}
    />
  );
}

function AIResponseMetadata({
  ai,
  query,
  results,
}: {
  ai: BraveAIAnswer;
  query: string;
  results: BraveWebResult[];
}) {
  const sources = formatSourcesForMetadata(ai.sources.length > 0 ? ai.sources : results.map(resultToSource));

  return (
    <List.Item.Detail.Metadata>
      {sources.map((source, index) => (
        <List.Item.Detail.Metadata.Link
          key={`${source.url}:${index}`}
          title={index === 0 ? "Sources" : ""}
          text={truncate(source.title, 70)}
          target={source.url}
        />
      ))}
      {sources.length > 0 && (query || ai.error) ? <List.Item.Detail.Metadata.Separator /> : null}
      {query ? <List.Item.Detail.Metadata.Label title="Query" text={query} /> : null}
      {ai.error ? <List.Item.Detail.Metadata.Label title="AI Status" text={ai.error} /> : null}
      <List.Item.Detail.Metadata.Label
        title="Notice"
        text="AI-generated answer. Please verify critical facts."
      />
    </List.Item.Detail.Metadata>
  );
}

function SearchOpenActions({ query, conversationId }: { query: string; conversationId?: string }) {
  if (!query) {
    return null;
  }

  return (
    <ActionPanel.Section>
      <Action.OpenInBrowser
        title="Open Brave Search"
        icon={Icon.MagnifyingGlass}
        url={buildSearchUrl(query)}
      />
      <Action.OpenInBrowser
        title="Open AI Conversation"
        icon={Icon.Globe}
        url={buildAskUrl(query, conversationId)}
      />
    </ActionPanel.Section>
  );
}

function DeleteSearchAction({ query }: { query: string }) {
  return (
    <Action
      title="Delete Search from History"
      icon={Icon.Trash}
      style={Action.Style.Destructive}
      onAction={async () => {
        await deleteHistoryForQuery(query);
        await showToast({ style: Toast.Style.Success, title: "Deleted search from history" });
      }}
    />
  );
}

function getAIItemTitle(state: SearchState): string {
  if (!state.query) {
    return "Type a query to search Brave";
  }
  if (state.ai.status === "loading") {
    return "Loading Brave AI answer...";
  }
  if (state.ai.status === "error") {
    return "AI answer unavailable";
  }
  if (!state.ai.answer) {
    return "No AI answer returned";
  }
  return truncate(state.ai.answer.replace(/\n/g, " "), 80);
}

function resultToSource(result: BraveWebResult): BraveSource {
  return {
    title: result.title,
    url: result.url,
  };
}

function hasSearchContext(searchPage: SearchPageResult): boolean {
  return searchPage.results.length > 0 || Boolean(searchPage.conversationId);
}

function cachedSuggestionsForDisplay(cachedEntry: BraveSearchEntry, settings: SearchSettings): string[] {
  return limitCompletionSuggestions(cachedEntry.suggestions, settings.completionSuggestionCount);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
