---
layout: default
---

{% for post in site.posts limit:10 %}

### {{ post.date | date: "%d %B %Y à %H:%M" }}

{{ post.excerpt | strip_html | truncatewords: 50 }}

[Lire la suite →]({{ post.url | relative_url }})

---

{% endfor %}

[HNPaper](https://hnpaper-labs.gaidot.net) by [Régis Gaidot](https://regis.gaidot.net)
