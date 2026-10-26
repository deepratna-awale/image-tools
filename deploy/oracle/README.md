# Free hosting on Oracle Cloud (Always Free)

The whole stack (frontend, API, worker, RabbitMQ, plus Caddy for HTTPS) runs on one Oracle Cloud Always Free Arm VM at no cost.

**Free tier limits** ([Oracle's list](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)):

- Ampere A1 VM: 2 OCPUs and 12 GB RAM in total. This stack needs about 2 to 3 GB.
- 200 GB of block storage and 10 TB of outbound traffic a month.
- Oracle can stop an Always Free VM that sits idle for 7 days (95th percentile CPU, network and memory all under 20%). If that happens, start it again from the console and the stack comes back on its own.

Sign-up asks for a card to verify identity. Always Free resources are never charged, but stay within the limits above so nothing billable gets created.

## 1. Create the VM

1. Sign up at <https://www.oracle.com/cloud/free/>. Pick a home region close to you; Always Free compute only runs in the home region.
2. In the console, open **Compute → Instances → Create instance**.
3. **Image**: Canonical Ubuntu 24.04. **Shape**: Ampere `VM.Standard.A1.Flex` with 2 OCPUs and 12 GB memory.
4. **Networking**: create a new virtual cloud network with a public subnet and keep **Assign a public IPv4 address** on.
5. **SSH keys**: download the generated private key (or paste your own public key).
6. Create it. If Oracle says it is out of capacity, try another availability domain or try again later.

## 2. Open ports 80 and 443

On the instance page, open the subnet, then its **Default Security List**, then **Add Ingress Rules**:

- Source CIDR `0.0.0.0/0`, IP protocol TCP, destination port range `80,443`.

The setup script opens the same ports in the VM's own firewall.

## 3. Install and start

SSH in with the key from step 1 (the user is `ubuntu`):

```bash
ssh -i path/to/private.key ubuntu@<public-ip>
```

Then clone the repo and run the setup script:

```bash
git clone https://github.com/deepratna-awale/image-tools.git
cd image-tools
./deploy/oracle/setup.sh
```

The script installs Docker, opens the firewall, writes `.env` with a random RabbitMQ password, and starts everything. The first build takes several minutes because it downloads the AI models. When it finishes it prints the address, `https://<public-ip-with-dashes>.sslip.io`, which works without buying a domain.

To use your own domain instead, point an A record at the VM's public IP and run `./deploy/oracle/setup.sh your.domain.com` on the first run (or change `SITE_ADDRESS` in `.env` later).

## Updating

```bash
cd image-tools
git pull
./deploy/oracle/setup.sh
```

## Checking on it

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.https.yml ps
sudo docker compose -f docker-compose.yml -f docker-compose.https.yml logs -f worker
```

The sky swap and background removal models are licensed for non-commercial use only (see `sky_model_url` and `rembg_model` in `backend/config/settings.py`), so swap them before using the site commercially.
