**Piecewise** templates are appropriate in some situations. They generally involve splitting all components of every template across several files, and they have very limited logic. However, used correctly, they can be much simpler and cleaner than the equivalent in most other template languages.

Here’s an example. Consider this `layout.pwp`:

```html
<!DOCTYPE html>

<html>
	<head>
		<meta charset="utf-8">

		<title>{{ title }} – My Blog</title>
	</head>
	<body>
		{{ body }}
	</body>
</html>
```

And this `example.pwp`:

```html
<div id="articles">
	{{ article < @articles }}
</div>
```

This `article.pwp`:

```html
<article class="blog-post">
	<h2>{{ @title }}</h2>

	<div class="body">
		{{ @body | }}
	</div>

	<div class="comments">
		{{ @comments.length }} comment{{ @comments.length | s }}
		{{ comment < @comments }}
	</div>
</article>
```

This `comment.pwp`:

```html
<article class="comment">
	<h4>{{ @title }}</h4>

	<div class="body">
		{{ @body | }}
	</div>
</article>
```

You could put them together like this:

```js
"use strict";

var piecewise = require("piecewise");

piecewise.filters.s = function(n) {
	return n === 1 ? "" : "s";
};

var templates = new piecewise.DirectoryLoader(__dirname);

var example = templates.load("layout", {
	title: "All Articles",
	body: templates.read("example")
});

console.log(example.render({
	articles: [
		{
			title: "Example post",
			body: "<p>Hello, world!</p>",
			comments: [
				{
					title: "Foo",
					body: "bar"
				},
				{
					title: "Baz",
					body: "qux"
				}
			]
		}
	]
}));
```

This renders… in a way that I hope you can infer from context.

Here are the `{{`/`}}`-delimited “expressions” available:

 - `{{ @value.path | filter1 | filter2 | … }}` – runs *`value.path`* through any number of filters. If no filters are provided, generic HTML-escaping is used; to disable this, add a trailing `|`, e.g. `{{ @body | }}` as seen above.
 - `{{ template }}` – includes a template named *`template`*.
 - `{{ template @value.path }}` – includes a template if *`value.path`* in the context is truthy according to JavaScript. The context for the new template is the value of *`value.path`*.
 - `{{ template ! @value.path }}` – the same as above, but negated, and the new template has no context.
 - `{{ template < @value.path }}` – includes *`template`* for each item in the array or array-like object at *`value.path`* in the context. The context for each included template is the current item.
 - `{{ {{ }}` – the literal text `{{`.

And here are the built-in filters, which can be removed, extended, or modified through the exported `filters` object:

 - `html` – the default filter when none are provided; escapes `<`, `>`, `"`, and `&`.
 - `url` – escapes using the JavaScript function `encodeURIComponent`.
 - `text` – escapes `<`, `>`, and `&` to HTML entities.
 - `attr` – escapes `"` and `&` to HTML entities.

Please keep everything nice and functional and use double-quotes in your HTML, or things are liable to break in unexpected ways and behave differently across any versions.

You don’t have to put everything in a different file; consider writing a loader for XML, for example! It’s fun. Don’t be afraid to look at `piecewise.js`; it’s only about 300 lines.

### The todo list

 - Allow templates that include themselves by splitting them out into functions when required.
 - Throw errors when a template tries to use a context when it doesn’t have one.
