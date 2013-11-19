"use strict";

var fs = require("fs");
var path = require("path");

var ESCAPE = /^\s*\{\{\s*$/;
var INCLUDE = /^\s*([\w-]+)\s*$/;
var VARIABLE = /^\s*@([\w-]+(?:\.[\w-]+)*)\s*((?:\|\s*[\w-]+\s*)*|\|\s*)$/;
var OPERATOR = /^\s*([\w-]+)\s*([<!]?)\s*@([\w-]+(?:\.[\w-]+)*)\s*$/;

var operators = {
	"": "if",
	"!": "ifnot",
	"<": "repeat"
};

var reservedWords = [
	"break", "case", "catch", "continue", "debugger", "default", "delete",
	"do", "else", "finally", "for", "function", "if", "in", "instanceof",
	"new", "return", "switch", "this", "throw", "try", "typeof", "var",
	"void", "while", "with",
	"class", "const", "enum", "export", "extends", "import", "super",
	"implements", "interface", "let", "package", "private", "protected",
	"public", "static", "yield"
];

var filters = {
	html: function(text) {
		return String(text).replace(/&/g, "&amp;")
		                   .replace(/</g, "&lt;")
		                   .replace(/>/g, "&gt;")
		                   .replace(/"/g, "&quot;");
	},
	text: function(text) {
		return String(text).replace(/&/g, "&amp;")
		                   .replace(/</g, "&lt;")
		                   .replace(/>/g, "&gt;");
	},
	attr: function(text) {
		return String(text).replace(/&/g, "&amp;")
		                   .replace(/"/g, "&quot;");
	},
	url: encodeURIComponent
};

function singleQuotedEscape(string) {
	return string.replace(/\\/g, "\\\\")
	             .replace(/'/g, "\\'")
	             .replace(/\n/g, "\\n")
	             .replace(/\r/g, "\\r")
	             .replace(/\u2028/g, "\\u2028")
	             .replace(/\u2029/g, "\\u2029");
}

function escapePath(root, path) {
	return root + path.split(".").map(function(part) {
		if (part.indexOf("-") === -1)
			return "." + part;

		return "['" + part + "']";
	}).join("");
}

function filter(expression, filters) {
	var code = "";

	for (var i = filters.length; i--;)
		code += filters[i] + "(";

	return code + expression + new Array(filters.length + 1).join(")");
}

var LETTER_I = 105;
var LETTER_Z = 122;

function VariableManager() {
	this.used = {
		filters: true,
		data: true
	};
}

VariableManager.prototype.getName = function(name) {
	name = name
		.replace(/[.-]+$/, "")
		.replace(/[.-]+(.)/g, function(_, c) {
			return c.toUpperCase();
		});

	if (/^\d/.test(name) || reservedWords.indexOf(name) !== -1)
		name = "_" + name;

	while (this.used.hasOwnProperty(name))
		name += "_";

	this.used[name] = true;
	return name;
};

VariableManager.prototype.getIndexName = function() {
	var i = LETTER_I;
	var name;

	while (i <= LETTER_Z && this.used.hasOwnProperty(name = String.fromCharCode(i)))
		i++;

	if (i > LETTER_Z)
		return this.getName("i_");

	this.used[name] = true;
	return name;
};

function parseFilters(filterList) {
	filterList = filterList.trim();

	if (!filterList)
		return ["filters.html"];

	if (filterList === "|")
		return [];

	return filterList.match(/[\w-]+/g).map(function(f) {
		return escapePath("filters", f);
	});
}

function lex(template) {
	var i;
	var last = 0;
	var tokens = [];
	var errors = [];

	while ((i = template.indexOf("{{", last)) !== -1) {
		if (i > last)
			tokens.push({
				type: "text",
				value: template.substring(last, i)
			});

		var start = i + 2;
		var end = template.indexOf("}}", start);

		if (end === -1) {
			errors.push({
				index: i,
				message: "Unclosed opening braces"
			});

			break;
		}

		var expression = template.substring(start, end);
		var m;

		if (ESCAPE.test(expression))
			tokens.push({ type: "escape", value: "{{" });
		else if (m = INCLUDE.exec(expression))
			tokens.push({ type: "include", name: m[1] });
		else if (m = VARIABLE.exec(expression))
			tokens.push({
				type: "variable",
				name: m[1],
				filters: parseFilters(m[2])
			});
		else if (m = OPERATOR.exec(expression))
			tokens.push({
				type: operators[m[2]],
				template: m[1],
				variable: m[3]
			});
		else
			errors.push({
				index: start,
				message: "Unrecognized expression"
			});

		last = end + 2;
	}

	if (last < template.length)
		tokens.push({
			type: "text",
			value: template.substring(last)
		});

	if (errors.length)
		throw errors;

	return tokens;
}

function compile(load, dataVariable, name, variables, chain, functions) {
	var compile_ = function(dataVariable, name) {
		if (functions.hasOwnProperty(name))
			return "' + " + functions[name] + "(" + dataVariable + ") + '";

		return compile(load, dataVariable, name, variables, chain, functions);
	};

	var template = load(name);
	var tokens = lex(template);
	var code = "";

	if (!functions.hasOwnProperty(name) && chain.indexOf(name) !== -1) {
		var functionName = variables.getName(name);
		functions[name] = functionName;

		var funcVariables = new VariableManager();
		funcVariables.used[functionName] = true;

		code = "' + (function " + functionName + "(data) { var output = '" + compile(load, "data", name, funcVariables, chain, functions) + "'; return output; })(" + dataVariable + ") + '";

		delete functions[name];
		return code;
	}

	chain.push(name);

	for (var i = 0, l = tokens.length; i < l; i++) {
		var token = tokens[i];

		switch (token.type) {
			case "text":
			case "escape":
				code += singleQuotedEscape(token.value);
				break;

			case "variable":
				var filtered = filter(escapePath(dataVariable, token.name), token.filters);

				code +=
					"' + " + filtered + " + '";
				break;

			case "include":
				code += compile_(dataVariable, token.name);
				break;

			case "if":
				var conditionPath = escapePath(dataVariable, token.variable);

				code +=
					"';\nif (" + conditionPath + ") {\n" +
					"output += '" + compile_(dataVariable, token.template) +
					"';\n}\noutput += '";
				break;

			case "ifnot":
				code +=
					"';\nif (!" + escapePath(dataVariable, token.variable) + ") {\n" +
					"output += '" + compile_(dataVariable, token.template) +
					"';\n}\noutput += '";
				break;

			case "repeat":
				var indexName = variables.getIndexName();
				var collectionPath = escapePath(dataVariable, token.variable);
				var variableName = variables.getName(token.template);

				code +=
					"';\nfor (var " + indexName + " = 0; " + indexName + " < " + collectionPath + ".length; " + indexName + "++) {\n" +
					"var " + variableName + " = " + collectionPath + "[" + indexName + "];\n" +
					"output += '" + compile_(variableName, token.template) +
					"';\n}\noutput += '";
				break;

			default:
				throw new Error("Unrecognized token type " + token.type);
		}
	}

	return code;
}

function Template(code) {
	this.func = new Function("filters, data", "var output = '" + code + "';\nreturn output;");
}

Template.prototype.render = function(data) {
	return this.func(filters, data);
};

function DirectoryLoader(root, options) {
	this.root = root;
	this.ext = (options && options.extension) || ".pwp";
	this.cache = {};
}

DirectoryLoader.prototype.read = function(name) {
	if (this.cache.hasOwnProperty(name))
		return this.cache[name];

	return this.cache[name] = fs.readFileSync(path.join(this.root, name + this.ext), "utf8");
};

DirectoryLoader.prototype.load = function(name, override) {
	var loader = this;

	return new Template(compile(function(name) {
		if (override.hasOwnProperty(name))
			return override[name];

		return loader.read(name);
	}, "data", name, new VariableManager(), [], {}));
};

module.exports.filters = filters;
module.exports.compile = compile;
module.exports.Template = Template;
module.exports.DirectoryLoader = DirectoryLoader;
