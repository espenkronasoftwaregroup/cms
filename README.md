# ESG-CMS middleware

## What and why
ESG-CMS is a file based cms middleware for express (or similar) based on ejs templates and markdown. The goal of this project is to be an extremely light weight, highly customizable cms with as few dependencies as possible. This project is not meant to be a drop in wordpress replacement or such, as it requires basic html/css/js/node skills to use. For example no "admin area" is included in this project. The user will either have to code their own or edit the files on disk.

## How does it work
The cms is centered around two concepts, "pages" and "items". A page consists of an optional controller and a template and acts as a "regular" page. It is given a route based on the names on the folders its placed in. An item or item type is a page acting as a template for displaying many similar items, such as products or blog posts.

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

## Example usage

Have a folder structure that looks like this:
```
data
│
└───items
│   │
│   └───blog
│       │   template.ejs
|       |
│       └───i_love_cats
│       │   content.ejs
|       |
│       └───cats_are_the_best
|           content.md
│   
└───pages
|   |
│   └───cats
|       controller.js
|       template.ejs
|
└───partials
    head.ejs
```