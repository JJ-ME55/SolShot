# Proofreading Pass: Remove AI Tells

You've drafted a series of documents for the user. Before they go out, do a proofreading pass on every document with the goal of removing the patterns that flag text as AI-written. The user will be reading these as a human reader, and may also run them past colleagues who use LLMs heavily and will spot the tells immediately.

This is not a light edit. Read each document end to end, mark every instance of the patterns below, and rewrite. Don't just swap one AI tic for another.

## The non-negotiables

These are the patterns that get text clocked as AI-written within the first paragraph. Strip them out completely.

### Em dashes

The single biggest tell. Models reach for the em dash as a universal connector — to add emphasis, introduce an aside, link two ideas, or break rhythm. Humans use them, but sparingly. AI uses them three or four times per page.

- Aim for **zero em dashes** in the final document unless one is genuinely the best choice and there are no others nearby
- Replace with: a full stop and new sentence, a comma, a colon, parentheses, or just rewrite the sentence so the dash isn't needed
- The same applies to en dashes used the same way

### "It's not just X, it's Y" and its relatives

Models love this rhetorical shape. Variants to hunt down:
- "This isn't just about X — it's about Y"
- "More than just X, it's Y"
- "Not only X but also Y"
- "X is more than Y; it's Z"

Rewrite as a direct claim. If the point is that something is Y, just say it's Y.

### Mechanical transitions

Cut or replace these wherever they appear at the start of a sentence or paragraph:
- Furthermore, Moreover, Additionally, In addition
- As a result, Consequently, Therefore, Thus
- In conclusion, To summarise, In summary, Ultimately
- It's important to note that, It's worth noting that, Notably
- In today's [fast-paced/digital/modern] world

Most of these can simply be deleted — the sentence works without them. Where a connector is genuinely needed, use a plainer one ("So," "But," "Also," "Then") or restructure so the logical link is implicit.

### Vocabulary that screams LLM

Replace these with plainer alternatives:
- delve, delve into → look at, examine, go through
- navigate (metaphorically) → handle, deal with, work through
- landscape (metaphorically) → just name the actual thing
- tapestry, mosaic, symphony (as metaphors for anything) → cut entirely
- robust, comprehensive, holistic, seamless, leverage, utilise → strong, full, whole, smooth, use, use
- nuanced, intricate, multifaceted → specific, detailed, or just describe what's actually complex about it
- realm, sphere, arena → field, area, or the actual noun
- foster, cultivate (when applied to abstract things) → build, grow, encourage
- crucial, pivotal, paramount, vital → important, key, or just drop the intensifier

Rule of thumb: if a word feels like it's working hard to sound impressive, swap it for the plainer word that means the same thing.

## Structural patterns to break

### Uniform paragraph rhythm

AI text produces paragraphs of similar length, all equally polished, all built the same way (topic sentence, two supporting sentences, summary sentence). Real human writing has:
- Some short paragraphs. Sometimes one sentence.
- Some long ones that ramble a bit before landing
- Uneven quality — a strong paragraph next to a more functional one

When you proofread, look at paragraph lengths down the page. If they're all roughly the same size, break some up and let others run longer.

### Uniform sentence rhythm (burstiness)

The technical term is **burstiness** — variation in sentence length and structure. AI tends toward sentences of 15–25 words, all grammatically clean, all about the same shape. Fix this by deliberately varying:
- Drop in some short sentences. Five words. Even three.
- Let some sentences run long, with subordinate clauses that wander a bit before getting to the point
- Start sentences with different structures — not always a noun phrase, sometimes a clause, sometimes a connector, sometimes a verb

If you read the document aloud and it feels metronomic, the burstiness is too low.

### Symmetrical bullet points

If a document has bullet lists, check whether every bullet is roughly the same length and structure. AI defaults to perfectly parallel bullets. Humans don't. Either:
- Make some bullets one line and others three lines, or
- Convert the list to prose where prose would actually read better

Lists are appropriate for genuinely list-shaped content (steps, items, options). They're not appropriate as a default formatting choice. If a paragraph has been broken into four bullets to "look organised," put it back into a paragraph.

### Bold scattered through prose

AI sprinkles **bold text** through paragraphs to "highlight key terms." This is a strong tell. Remove all in-paragraph bolding unless there's a specific reason a particular phrase needs emphasis (rare). Headings can stay bold; body prose should not contain bolded phrases.

### The summary close

Models tend to end documents (and sections, and sometimes paragraphs) with a summarising sentence that restates what was just said. Cut these. End on the last substantive point. If a document genuinely needs a conclusion, write one that adds something — a recommendation, a next step, a sharper framing — not a restatement.

## Tone-level patterns

### Promotional puffing

AI describes things in inflated, important-sounding ways. The example often given: a model will describe Ray Kroc as "a titan of the casual culinary landscape" rather than "the man who popularised McDonald's." Look for:
- Adjective stacks ("innovative, dynamic, forward-thinking solution")
- Vague intensifiers ("truly remarkable," "incredibly powerful," "uniquely positioned")
- Abstract nouns where a concrete one would work ("solutions," "offerings," "experiences" instead of the actual product or service)

Rewrite for plain, specific description. If you can't say something specific about it, the sentence probably shouldn't be there.

### Balanced both-sides hedging where a position is needed

AI defaults to "on one hand, on the other hand" balance even when the document is meant to make a recommendation or take a view. If the document is supposed to argue something, it should argue it. Cut hedging that softens claims the user actually wants made.

### Generic when specific is available

Look for sentences that could appear in any document on any topic. Replace with details that anchor to this specific subject — names, numbers, concrete examples, the actual context.

## Spelling and register

- Pick a single English variant (UK or US) and stick to it the whole way through. AI text often drifts between the two within a single document. Given the user is UK-based, default to British English unless a document is specifically aimed at a US audience.
- Watch for: -ize/-ise, -or/-our, -er/-re, "gotten" vs "got"

## What to do with citations and links

If any document includes references, hyperlinks, statistics, or quotes:
- Verify every URL resolves to a real, relevant page (AI commonly fabricates plausible-looking URLs)
- Check every statistic has a real source
- Flag any quote attributed to a named person — confirm the person actually said it
- If you can't verify something, either remove it or flag it clearly for the user to check

## The proofreading workflow

For each document:

1. **First pass — patterns.** Read through and mark every em dash, every "it's not just X it's Y," every mechanical transition, every flagged vocabulary item. Don't fix yet, just mark.

2. **Second pass — rewrite.** Go back and rewrite each marked instance. Don't just delete — make sure the sentence still works and says what it needs to say.

3. **Third pass — rhythm.** Read the document aloud (or imagine reading it aloud). Where the rhythm feels metronomic, vary sentence and paragraph length. Where bullets feel mechanical, convert to prose or vary the bullet lengths.

4. **Fourth pass — specifics.** Look for any sentence that could appear in a generic document on this topic. Either anchor it to specifics or cut it.

5. **Fifth pass — fact-check.** Verify any links, citations, statistics, or quotes.

6. **Final read.** Read the whole document one more time as if you were the recipient. Does it sound like a person wrote it? Does it sound like *this* person — i.e. the user — would have written it? If anything still feels machine-shaped, fix it.

## What you should NOT do

- Don't introduce typos or deliberate errors to "look human." That's not the goal — the goal is natural, varied, specific writing, not flawed writing.
- Don't add filler hedges ("I think," "in my opinion," "honestly") to manufacture voice. Voice comes from specificity and rhythm, not from added qualifiers.
- Don't strip out every em dash and replace it with something equally formulaic. Vary the replacements.
- Don't over-shorten. The goal isn't terse, it's varied. Some sentences should still be long.
- Don't lose information that the document is supposed to convey. The user needs the documents to do their job — readability without substance is a failure.

## Output

For each document, return:
1. The cleaned-up version (this is the deliverable)
2. A short note flagging any factual claims, citations, or quotes that need the user's verification before sending out

Keep the user's voice consistent across all the documents in the series. If you make a stylistic choice in document 1 (e.g. how you handle a recurring transition), apply it the same way in documents 2, 3, and so on.
