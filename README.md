# ESG-CMS middleware

## What and why
ESG-CMS is a middleware for express (or similare) is a router which primary focus is to map urls to files on disk while also providing some basic cms-like functionality. This project is not meant to be a drop in wordpress replacement or such, as it requires basic html/css/js/node skills to use.

## How does it work
The middleware is centered around the concepts of "pages" and items". A page or item consists of a template and an (optional) controller, that is used to provide the template with data. What differs is that items can have sub-content, in the form of ejs or md files, that will be provided automatically during rendering. Items can be thought of things that should be presented in a simliar manner, such as blog posts. The root of the item directory will provide the basis of the presentation while the actual content will come from files in the subdirectory. Example:

```
items
│   │
│   └───blog
│       │   template.ejs
|       |   controller.js
|       |
│       └───i_love_cats
│       │   content.ejs
|       |
│       └───cats_are_the_best
|           content.md
```

If a request is made to yourdomain.com/blog/i_love_cats the contents of content.ejs will be rendered in the slot specified in the items/blog/template.ejs, aided by the data provided by items/blog/controller.js.

## Example usage




The middleware takes a couple of paths as argument:
```
{
	itemsPath: './items', // items directory
	notFoundTemplate: './notFound.ejs', // will be shown when a page or item is not found
	pagesPath: './pages', // pages directory
	partialsPath: './partials', // path to directory with partial ejs templates
	rootPagePath: './pages/home' // the page that will be shown when / is requested
}
```

## Prio for items
Use item root controller then root template
If item has a content.ejs template file load that into viewData.content otherwise load content.md into viewdata.content
if data.json exists, load that into viewData.data and pass to template rendering

## Examples

See code in examples dir for basic usage.

## Parameters
| Name               | Description |
| -----------        | ----------- |
| itemsPath          | Title       |
| notFoundTemplate   | Text        |

## Return values