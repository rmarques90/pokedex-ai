# LLM Prompt Injection Protection

## 1. Context and Problem

The application has a LangChain guardrail that uses local patterns to reject known prompt-injection instructions in user questions and retrieved evidence. Pattern checks can miss less obvious attacks. This activity adds an LLM-based safety review using `openai/gpt-oss-safeguard-20b`, while retaining the existing guardrail.

## 2. User Stories

- As a Pokédex user, I want unsafe prompt-injection requests rejected before an answer is generated, so that the assistant follows its safety and evidence boundaries.
- As a project maintainer, I want the safety model to be configurable through the existing OpenRouter model configuration, so that the safeguard model can be changed later.

## 3. Functional Requirements

- **FR-1:** The system must call the `openai/gpt-oss-safeguard-20b` model through OpenRouter, integrated with LangChain, to assess prompt-injection safety.
- **FR-2:** The LLM-based assessment must supplement the existing LangChain guardrail; the current checks must remain enabled.
- **FR-3:** The LLM-based assessment must evaluate only the user's question. Retrieved evidence is considered safe for this assessment.
- **FR-4:** The safety assessment must distinguish prompts considered safe from prompts considered unsafe.
- **FR-5:** When a prompt is considered unsafe, the system must reject the request and return a clear safety error to the user.
- **FR-6:** When a request is rejected, the system must not generate an answer or return an answer based on that request.
- **FR-7:** If the safety model is unavailable or its assessment cannot be validated, the system must return an error and must not allow the request to proceed.
- **FR-8:** Safety errors must be handled by the existing CLI and HTTP boundaries without exposing internal prompts, provider credentials, or private model diagnostics.

## 4. Acceptance Criteria

- When a user submits a safe question, the system must continue the existing answer workflow after safety checks pass.
- When a user submits a prompt-injection attempt detected by the safety model, the system must return a clear safety error and must not invoke answer generation.
- When the existing guardrail detects unsafe user input or retrieved evidence, the system must continue to reject it even if the LLM-based assessment considers it safe.
- When the safety model is unavailable or returns an invalid assessment, the system must return an error and must not continue to answer the request.
- When a safety rejection reaches the CLI or HTTP API, the user must receive the appropriate existing boundary error response without internal provider details.
- When the safety model is configured through OpenRouter, its identifier must be `openai/gpt-oss-safeguard-20b` and it must be replaceable through project configuration.

## 5. Out of Scope

- Removing or replacing the existing pattern-based guardrail.
- Changing retrieval policy, answer generation model, response format, or Pokémon data.
- Adding an interactive conversation flow or new HTTP routes.
- Defining a general content moderation policy beyond prompt-injection protection.

## 6. Open Questions

- None. The LLM-based assessment checks only the user's question, and the request fails with an error if the model is unavailable or its assessment is invalid.
