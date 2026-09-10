terraform {


  required_version = ">= 1.9"
  required_providers {


    google = {

      source  = "hashicorp/google",
      version = "~> 8.1"
    }


    random = {

      source  = "hashicorp/random",
      version = "~> 3.7"
    }


  }


}

variable "project_id" {

  type = string
}

variable "region" {

  type    = string
  default = "us-central1"
}

variable "zone" {

  type    = string
  default = "us-central1-a"
}

provider "google" {

  project = var.project_id
  region  = var.region
}

resource "google_project_service" "required" {


  for_each = toset(["sqladmin.googleapis.com", "run.googleapis.com", "compute.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "cloudtasks.googleapis.com", "cloudscheduler.googleapis.com", "aiplatform.googleapis.com", "identitytoolkit.googleapis.com", "firebase.googleapis.com", "iamcredentials.googleapis.com", "iam.googleapis.com", "cloudresourcemanager.googleapis.com", "cloudbuild.googleapis.com", "logging.googleapis.com", "monitoring.googleapis.com"])

  service = each.value

  disable_on_destroy = false

}

resource "google_service_account" "api" {
  depends_on = [google_project_service.required]

  account_id   = "roadstar-api"
  display_name = "RoadStar operational API"
}

resource "google_service_account" "worker" {
  depends_on = [google_project_service.required]

  account_id   = "roadstar-worker"
  display_name = "RoadStar computation worker"
}

resource "google_service_account" "tasks" {
  depends_on = [google_project_service.required]

  account_id   = "roadstar-tasks"
  display_name = "RoadStar task invoker"
}

resource "google_project_iam_member" "api_roles" {


  for_each = toset(["roles/cloudsql.client", "roles/cloudtasks.enqueuer", "roles/firebaseauth.viewer"])

  project = var.project_id

  role = each.value

  member = "serviceAccount:${google_service_account.api.email}"

}

resource "google_project_iam_member" "worker_vertex" {


  project = var.project_id

  role = "roles/aiplatform.user"

  member = "serviceAccount:${google_service_account.worker.email}"

}

resource "google_service_account_iam_member" "enqueue_as_tasks" {


  service_account_id = google_service_account.tasks.name

  role = "roles/iam.serviceAccountUser"

  member = "serviceAccount:${google_service_account.api.email}"

}

resource "google_artifact_registry_repository" "images" {


  repository_id = "roadstar"

  location = var.region

  format = "DOCKER"

  depends_on = [google_project_service.required]

}

resource "google_sql_database_instance" "roadstar" {


  name = "roadstar-postgres16"

  database_version = "POSTGRES_16"

  region = var.region

  deletion_protection = true
  settings {


    edition = "ENTERPRISE"

    tier = "db-custom-2-7680"

    availability_type = "ZONAL"

    disk_type = "PD_SSD"

    disk_size = 50

    disk_autoresize = true

    disk_autoresize_limit = 100
    backup_configuration {

      enabled                        = true
      point_in_time_recovery_enabled = true
    }

    ip_configuration {

      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }


    user_labels = {

      app         = "roadstar",
      environment = "preview"
    }


  }


  depends_on = [google_project_service.required]

}

resource "google_sql_database" "roadstar" {

  name     = "roadstar"
  instance = google_sql_database_instance.roadstar.name
}

resource "random_password" "database" {

  length  = 40
  special = false
}

resource "google_sql_user" "roadstar" {


  name = "roadstar_app"

  instance = google_sql_database_instance.roadstar.name

  password = random_password.database.result

}

resource "google_secret_manager_secret" "database_url" {


  secret_id = "roadstar-database-url"
  replication {
    auto {

    }

  }


  depends_on = [google_project_service.required]

}

resource "google_secret_manager_secret_version" "database_url" {


  secret = google_secret_manager_secret.database_url.id

  secret_data = "postgresql://roadstar_app:${random_password.database.result}@localhost/roadstar?host=/cloudsql/${google_sql_database_instance.roadstar.connection_name}"

}

resource "google_secret_manager_secret_iam_member" "api_database" {


  secret_id = google_secret_manager_secret.database_url.id

  role = "roles/secretmanager.secretAccessor"

  member = "serviceAccount:${google_service_account.api.email}"

}

resource "google_storage_bucket" "documents" {


  name = "${var.project_id}-roadstar-documents"

  location = var.region

  uniform_bucket_level_access = true

  public_access_prevention = "enforced"

  force_destroy = false
  versioning {

    enabled = true
  }


}

resource "google_storage_bucket_iam_member" "documents" {


  for_each = {

    api    = google_service_account.api.email,
    worker = google_service_account.worker.email
  }


  bucket = google_storage_bucket.documents.name

  role = "roles/storage.objectUser"

  member = "serviceAccount:${each.value}"

}

resource "google_cloud_tasks_queue" "roadstar" {


  name = "roadstar-jobs"

  location = var.region
  rate_limits {

    max_concurrent_dispatches = 2
    max_dispatches_per_second = 2
  }

  retry_config {

    max_attempts       = 5
    max_retry_duration = "900s"
    min_backoff        = "10s"
    max_backoff        = "120s"
  }


  depends_on = [google_project_service.required]

}

resource "google_compute_network" "roadstar" {

  name                    = "roadstar"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required]
}

resource "google_compute_subnetwork" "roadstar" {


  name = "roadstar"

  ip_cidr_range = "10.42.0.0/24"

  region = var.region

  network = google_compute_network.roadstar.id

  private_ip_google_access = true

}

resource "google_compute_firewall" "routing" {


  name = "roadstar-private-routing"

  network = google_compute_network.roadstar.name

  source_ranges = ["10.42.0.0/24"]

  target_tags = ["roadstar-routing"]
  allow {

    protocol = "tcp"
    ports    = ["8002"]
  }


}

resource "google_compute_firewall" "iap" {


  name = "roadstar-routing-iap"

  network = google_compute_network.roadstar.name

  source_ranges = ["35.235.240.0/20"]

  target_tags = ["roadstar-routing"]
  allow {

    protocol = "tcp"
    ports    = ["22"]
  }


}

resource "google_compute_disk" "tiles" {
  depends_on = [google_project_service.required]


  name = "roadstar-ontario-tiles"

  type = "pd-balanced"

  zone = var.zone

  size = 100

}

resource "google_compute_instance" "routing" {


  name = "roadstar-valhalla"

  machine_type = "e2-standard-4"

  zone = var.zone

  tags = ["roadstar-routing"]
  boot_disk {
    initialize_params {

      image = "debian-cloud/debian-12"
      size  = 20
    }

  }

  attached_disk {

    source      = google_compute_disk.tiles.id
    device_name = "roadstar-tiles"
  }

  network_interface {

    subnetwork = google_compute_subnetwork.roadstar.id
    access_config {

    }

  }

  service_account {

    email  = google_service_account.worker.email
    scopes = ["cloud-platform"]
  }


  metadata = {
    enable-oslogin = "TRUE"
  }


  labels = {

    app         = "roadstar",
    environment = "preview"
  }


}

output "sql_connection" {

  value = google_sql_database_instance.roadstar.connection_name
}

output "routing_private_ip" {

  value = google_compute_instance.routing.network_interface[0].network_ip
}

output "document_bucket" {

  value = google_storage_bucket.documents.name
}

output "api_service_account" {

  value = google_service_account.api.email
}

