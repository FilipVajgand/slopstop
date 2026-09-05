# Deploying slopstop.filipvajgand.com

DNS already resolves to `164.90.246.186`, the same box as the apex. Apache is
answering but has no vhost for the subdomain, so it currently returns **403 on
HTTP and nothing on HTTPS** (no certificate yet).

Three steps: upload, vhost, certificate.

## 1. Upload

From this repo:

```bash
rsync -avz --delete \
  --exclude DEPLOY.md \
  site/ USER@164.90.246.186:/var/www/slopstop/
```

Create the directory and set ownership first if it does not exist:

```bash
ssh USER@164.90.246.186 'sudo mkdir -p /var/www/slopstop && sudo chown -R $USER:www-data /var/www/slopstop'
```

## 2. Apache vhost

`/etc/apache2/sites-available/slopstop.conf`:

```apache
<VirtualHost *:80>
    ServerName slopstop.filipvajgand.com
    DocumentRoot /var/www/slopstop

    <Directory /var/www/slopstop>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>

    ErrorLog  ${APACHE_LOG_DIR}/slopstop-error.log
    CustomLog ${APACHE_LOG_DIR}/slopstop-access.log combined
</VirtualHost>
```

`Require all granted` is what fixes the current 403 — without a matching vhost
the request falls through to a default that denies.

```bash
sudo a2ensite slopstop
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Check it serves over plain HTTP before going further:

```bash
curl -I http://slopstop.filipvajgand.com/
```

## 3. Certificate

```bash
sudo certbot --apache -d slopstop.filipvajgand.com
```

Certbot writes the `:443` vhost and the HTTP→HTTPS redirect itself. Confirm the
renewal timer is active:

```bash
systemctl list-timers | grep certbot
```

## 4. Verify

```bash
curl -sI https://slopstop.filipvajgand.com/ | head -1          # expect 200
curl -sI https://slopstop.filipvajgand.com/privacy.html | head -1
```

Both store submissions need the privacy policy URL:
`https://slopstop.filipvajgand.com/privacy.html`

## Updating later

Re-run the rsync in step 1. The pages are static with no build step.

## Before submitting to the stores

`index.html` currently says Slopstop is awaiting review and gives manual install
instructions. Once the listings are live, replace that block with the real store
links.
