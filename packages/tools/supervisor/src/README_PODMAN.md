# Linux

To make podman work with dockerode on Linux:

systemctl --user enable --now podman.socket
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock

# Mac

If using a Mac first enable the socket in the VM:

```
podman machine ssh
sudo su -
systemctl enable --now podman.socket
exit
exit
```

Then on the local mac:

```
podman system connection list --format json
```

Find the `podman-machine-default` Identity and add that:

```
ssh-add ~/.local/share/containers/podman/machine/machine
```

We need to map the VM socket to a local one, so in a term that we will leave open:

```
mkdir -p ~/podman
pkill -f 'podman/podman.sock' || true
rm -f ~/podman/podman.sock
ssh -L ~/podman/podman.sock:/run/user/501/podman/podman.sock \
  -i ~/.local/share/containers/podman/machine/machine \
  core@127.0.0.1 -p 54599 -N
```

use that socketpath in .env
```
SOCKET_PATH=/Users/yourname/podman/podman.sock
```

