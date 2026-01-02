---
layout: default
---

# 📰 HN Paper News

> Actualités tech automatisées depuis [hnpaper](https://hnpaper-labs.gaidot.net/)

---

{% for post in site.posts limit:10 %}

### [{{ post.title }}]({{ post.url | relative_url }})

**{{ post.date | date: "%d %B %Y à %H:%M" }}**

{{ post.excerpt | strip_html | truncatewords: 50 }}

[Lire la suite →]({{ post.url | relative_url }})

---

{% endfor %}
