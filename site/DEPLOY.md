# slopstop.filipvajgand.com

Deployed 2026-09-05. Live over HTTPS with a Let's Encrypt certificate.

## Where it lives

One DigitalOcean box, reachable as `root@64.23.176.162` and also fronted by the
floating IP `164.90.246.186`, which is what DNS points at. Both addresses reach
the same Apache.

```
docroot   /var/www/slopstop.filipvajgand.com/public_html
vhost     /etc/apache2/sites-available/slopstop.filipvajgand.com.conf
tls vhost /etc/apache2/sites-available/slopstop.filipvajgand.com-le-ssl.conf
logs      /var/log/apache2/slopstop.filipvajgand.com-{access,error}.log
cert      /etc/letsencrypt/live/slopstop.filipvajgand.com/
```

The vhost copies the conventions of the other sites on the box: `public_html`
docroot, dotfile and dependency-manifest denial, the hardening headers, and
`ServerSignature Off`. Files are owned `www-data:www-data`, directories `2750`,
files `640`.

## Publishing an update

```bash
rsync -az --delete --exclude DEPLOY.md \
  site/ root@64.23.176.162:/var/www/slopstop.filipvajgand.com/public_html/

ssh root@64.23.176.162 '
  chown -R www-data:www-data /var/www/slopstop.filipvajgand.com
  find /var/www/slopstop.filipvajgand.com/public_html -type f -exec chmod 640 {} \;
'
```

No Apache reload is needed for content changes. The pages are static with no
build step.

## Careful: Ansible

Every other vhost on this box is headed `## Managed by Ansible`. This one was
written by hand, so a playbook run could remove it. Add
`slopstop.filipvajgand.com` to the playbook when convenient.

## Certificate

Issued by Let's Encrypt, expires 2026-12-04, renewed automatically by
`certbot.timer` which is already active on the box. Certbot wrote the `:443`
vhost and the HTTP to HTTPS redirect itself.

```bash
ssh root@64.23.176.162 'certbot certificates'
ssh root@64.23.176.162 'certbot renew --dry-run'
```

## Checks

```bash
curl -sI https://slopstop.filipvajgand.com/ | head -1
curl -sI https://slopstop.filipvajgand.com/privacy.html | head -1
curl -sI http://slopstop.filipvajgand.com/ | head -1   # expect 301
```

Store submissions need the privacy policy URL:
`https://slopstop.filipvajgand.com/privacy.html`

## Still to do on the page

`index.html` carries the Firefox Add-ons link plus a line saying the listing is
awaiting review. Delete that line once Mozilla approves it:

```html
<p class="aside">
  Awaiting review on Firefox Add-ons. The link goes live once Mozilla approves it.
</p>
```

Then rsync as above. Nothing else on the page needs changing.
