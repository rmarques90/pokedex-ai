# Answer Quality and Direct Pokémon Lookup Specification

## 1. Context and problem

The current question-answering flow retrieves a fixed set of records by vector similarity. This can omit a Pokémon requested by National Pokédex number even though all 151 records are indexed. Answers to subjective questions such as “best Grass-type Pokémon” can also lead with a long abstention despite retrieved records containing useful, comparable stats. Users need direct answers that distinguish supported comparisons from missing or subjective criteria, while remaining grounded in the local dataset.

## 2. User stories

- As a Pokédex user, I want to identify a Pokémon by its National Pokédex number or exact name, so that I can get the requested record even when it is not among the most semantically similar records.
- As a Pokédex user, I want answers to state the result first and explain the evidence briefly, so that I can understand the answer without reading a long preamble.
- As a Pokédex user, I want questions asking which Pokémon is “best” to be answered using a clearly stated, measurable criterion when the indexed data supports a comparison, so that I can use the result without mistaking it for an objective ranking in every context.
- As a Pokédex user, I want limitations and source references to remain visible, so that I can judge how well the indexed data supports an answer.

## 3. Functional requirements

- **RF-1:** For a question that unambiguously identifies a National Pokédex number, the system shall return the matching indexed Pokémon record or clearly state that the record is unavailable.
- **RF-2:** For a question that unambiguously identifies an exact Pokémon name, the system shall return the matching indexed Pokémon record or clearly state that the record is unavailable.
- **RF-3:** The system shall not treat a vector-similarity result that omits the requested Pokémon as proof that the Pokémon does not exist in the indexed dataset.
- **RF-4:** For answerable questions, the system shall present the direct answer before qualifications or supporting explanation.
- **RF-5:** When a question asks for the “best” Pokémon and the indexed records support a comparison using measurable attributes, the system shall state the criterion used, provide the supported result, and clarify that the result is limited to that criterion.
- **RF-6:** When no suitable measurable criterion can be determined from the question and indexed records, the system shall briefly state the ambiguity and may ask the user to choose a criterion, while still presenting any useful comparison directly supported by the records.
- **RF-7:** The system shall use only facts supported by indexed records, preserve abstention when evidence is insufficient, and provide source references for records used in the answer.
- **RF-8:** The system shall apply the existing prompt-injection protections to user questions and retrieved record content before answer generation.
- **RF-9:** The system shall address every distinct request in the user's question using the complete question and the retrieved evidence; when asked for stats, it shall include individual stats present in the records.

## 4. Acceptance criteria

- When a user asks which Pokémon has National Pokédex number 3, the system shall identify Venusaur from the indexed record even if vector similarity would not return that record.
- When a user asks for an exact Pokémon name that exists in the indexed dataset, the system shall return that Pokémon’s indexed information and corresponding source references.
- When a requested number or exact name is not present in the indexed dataset, the system shall clearly report that the requested record is unavailable without inventing a match.
- When a user asks for the “best Grass-type Pokémon” and the indexed records contain comparable base-stat totals, the system shall state the Pokémon with the highest total among the records considered, identify “highest total base stats” as the criterion, and note that “best” can depend on other criteria.
- When a user asks an answerable question, the system shall put its answer before any uncertainty note or supporting details.
- When a user asks for the best Pokémon of a type and also requests an opinion and stats, the system shall pass the complete question and all matching indexed records to answer generation, then address the comparison, opinion, and individual stats supported by those records.
- When indexed evidence does not support a requested fact or comparison, the system shall state the limitation and shall not use external or unstated model knowledge to fill the gap.
- When an answer uses indexed records, the system shall include source references associated with the records used.
- When a user question or retrieved record contains prompt-injection instructions, the system shall continue to apply the existing prompt-injection protections before generating an answer.

## 5. Out of scope

- Adding new Pokémon records, attributes, or external knowledge sources.
- Multi-turn conversations or interactive clarification loops.
- Defining retrieval algorithms, database query mechanics, prompt templates, ranking formulas beyond stating supported dataset criteria, or module/file layout; these belong in the technical plan.
- Declaring a universal competitive or gameplay meaning of “best” Pokémon.

## 6. Open questions

- No open questions remain for this specification.
