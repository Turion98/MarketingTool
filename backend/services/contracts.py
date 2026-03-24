from __future__ import annotations

from typing import NotRequired, TypeAlias, TypedDict


JSONScalar: TypeAlias = None | bool | int | float | str
JSONValue: TypeAlias = JSONScalar | list["JSONValue"] | dict[str, "JSONValue"]
JSONObject: TypeAlias = dict[str, JSONValue]


class SfxItem(TypedDict):
    file: str
    time: int


class FragmentCondition(TypedDict):
    fragment: str
    goTo: str


class FragmentReference(TypedDict, total=False):
    id: str
    prefix: str
    suffix: str


class FragmentTextEntry(TypedDict, total=False):
    ifUnlocked: str
    default: str
    text: str


TextBlock: TypeAlias = str | list[FragmentTextEntry]


ImagePromptObject = TypedDict(
    "ImagePromptObject",
    {
        "global": NotRequired[str],
        "chapter": NotRequired[str],
        "page": NotRequired[str],
        "combinedPrompt": NotRequired[str],
        "negativePrompt": NotRequired[str],
    },
    total=False,
)


ImagePromptParts = TypedDict(
    "ImagePromptParts",
    {
        "global": NotRequired[str],
        "chapter": NotRequired[str],
        "page": NotRequired[str],
        "combinedPrompt": NotRequired[str],
        "negative": NotRequired[str],
        "negativePrompt": NotRequired[str],
    },
    total=False,
)


class ImagePromptMerge(TypedDict, total=False):
    include: list[str]
    exclude: list[str]


class FragmentGlobalEntry(TypedDict, total=False):
    text: str
    replayImageId: str
    imagePromptParts: str | ImagePromptParts


class StoryChoice(TypedDict, total=False):
    next: str
    showIfHasFragment: list[str]
    hideIfHasFragment: list[str]


class StoryLogic(TypedDict, total=False):
    ifHasFragment: list[FragmentCondition]


class StoryPage(TypedDict, total=False):
    id: str
    type: str
    text: TextBlock
    choices: list[StoryChoice]
    imagePrompt: str | ImagePromptObject
    imagePromptMerge: ImagePromptMerge
    audio: JSONObject
    transition: JSONObject
    sfx: list[SfxItem]
    logic: StoryLogic
    needsFragment: list[str]
    needsFragmentAny: list[str]
    showIfHasFragment: list[str]
    hideIfHasFragment: list[str]
    fragments: list[FragmentReference]
    fragmentRefs: list[FragmentReference]
    fragmentsGlobal: dict[str, FragmentGlobalEntry]
    effectiveImagePromptString: str


StoryDocument: TypeAlias = dict[str, JSONValue]


class AnalyticsProps(TypedDict, total=False):
    domain: str
    runId: str
    rid: str
    userId: str
    pageId: str
    page: str
    pg: str
    sessionId: str
    sid: str
    choiceId: str
    id: str
    kind: str
    isCorrect: bool
    pickedLabels: list[str]
    attempt: int
    control: str
    isEnd: bool
    endAlias: str
    endType: str


class AnalyticsEvent(TypedDict, total=False):
    id: str
    t: str
    ts: int
    storyId: str
    sessionId: str
    runId: str
    rid: str
    pageId: str
    page: str
    pg: str
    refPageId: str
    domain: str
    props: AnalyticsProps


class AnalyticsBatchHeader(TypedDict):
    _type: str
    ts: str
    storyId: str
    userId: str | None
    device: JSONObject
    domain: str
    count: int


class PuzzleByKindCounters(TypedDict):
    riddle: dict[str, int]
    runes: dict[str, int]
    unknown: dict[str, int]
