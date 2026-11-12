# 011 Technical Plan: Hybrid Pokémon Knowledge Answers

## Design

Extend the answer generator input with an explicit `retrieved` or `general` answer mode. The generator will choose the corresponding system policy. Retrieved mode remains strictly grounded and requires used record IDs. General mode receives an empty evidence array, is restricted to Pokémon topics, has no browsing/tools, and requires no evidence IDs. Both modes retain structured output validation and the same response shape.

The service first runs the existing safety check and retrieval. With evidence, it tries retrieved mode; if that answer abstains, it invokes general mode with an empty evidence array. With no evidence, it invokes general mode directly. Retrieval and safety exceptions continue to propagate. A successful general answer has `sources: []`; the frontend labels this provenance. A general-mode abstention has `abstained: true` and no sources.

## Data and API

No persistence or HTTP/CLI contract changes. The `PokemonAnswerGenerator` internal interface gains an answer mode. `AskResult` remains unchanged.

## Privacy boundary

General fallback receives no RAG records. On the retrieved path, selected RAG evidence is still sent to OpenRouter as it is today. The repository's current RAG is public Pokémon data; this behavior is not a privacy guarantee for future sensitive datasets.

## Validation

Cover retrieved answers, empty evidence fallback, abstention fallback, absence of RAG evidence in general mode, out-of-domain abstention instructions, citation isolation, and failure propagation. Update README to explain modes, sources, domain boundary, and provider data flow.
